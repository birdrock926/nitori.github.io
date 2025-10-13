# はじめてでも迷わないセットアップ完全ガイド

このドキュメントは、初めて Node.js や Strapi、Astro を触る方でも環境構築からローカル確認、本番公開の流れまで一通り体験できるように丁寧に説明しています。作業に不慣れな場合は、上から順番に読みながら手を動かしてみてください。

## 0. 全体像をつかむ
- **CMS (/cms)**: Strapi v5 で記事・タグ・メディアを管理する管理画面と API。
- **Web (/web)**: Astro + React Islands で構成されたハイブリッドサイト。Cloudflare Pages へ静的出力する一方、開発サーバでは SSR フォールバックで最新スラッグをその場で取得できます。
- **Infrastructure (/infrastructure)**: OCI Always Free 上で CMS を常駐させる Docker Compose と Caddy の設定例。
- **RichText 設定**: Font Scale 系プラグインを撤去し、Rich Text ブロックの `fontScale` は Strapi 標準の Decimal フィールドで管理します。`options.min/max/step` は 0.7/1.8/0.05 に設定済みで、空欄なら記事既定値 (1.0 倍) を適用します。`alignment` 列挙（left/center/right/justify）も追加しており、段落の整列方向を記事単位で指定できます。丸めや上下限は `cms/src/api/post/content-types/post/lifecycles.js` 内の `clampScaleValue` で制御しています。履歴と検証ログは AGENTS.md にまとまっています。
- **スラッグ正規化**: Post タイプの `beforeCreate` / `beforeUpdate` で slug を自動整形し、Document ID と数値 ID を基に同一記事を除外したうえで重複チェックを行います。別記事と衝突した場合のみ `-2` などの連番が付与されるため、既存記事を再編集しただけで URL が変わる心配はありません。意図的に slug を変更したときは、公開前に記事一覧で重複がないか確認してください。処理は `cms/src/api/post/content-types/post/lifecycles.js` に実装されています。
- **開発中の slug 反映**: Astro 側の `/posts/[slug].astro` は本番ビルド時のみ静的ページを生成し、`npm run dev` 実行中は SSR で毎回最新の slug を取得します。Strapi 管理画面で記事を追加・更新した直後でも、開発サーバーを再起動せずに `/posts/<slug>/` を開いて動作確認できます。
- Rich Text の本文は CKEditor が出力する HTML と Markdown 記法の両方をサポートしており、Strapi のライフサイクルと `web/src/lib/richtext.ts` が同じ `marked` + HTML 正規化ロジックで改行・装飾・相対パス画像を補正します。そのため SSR/CSR の差異によるハイドレーション警告や Markdown 記号の露出が発生しません。
- Strapi 管理画面のテキスト入力では `cms/patches/@strapi+design-system+2.0.0-rc.30.patch` を適用し、`unique` 属性が DOM に出力されて React が警告を出す現象を防いでいます。パッチを削除した場合は管理画面を再ビルドすると警告が再発するため注意してください。

実際の作業は、ローカル PC 上でリポジトリを用意 → 依存パッケージをインストール → 動作確認 → 必要に応じてクラウドへデプロイ、という順番です。

## 1. 事前にインストールするもの
| ソフト | 推奨バージョン | 役割 |
| --- | --- | --- |
| [Node.js](https://nodejs.org/ja) | 20 LTS (20.x) | CMS / Web 両方で使います。インストールすると npm も入ります。 |
| npm | Node.js 20 同梱の v10 以上 | パッケージ管理に使用します。 |
| [Git](https://git-scm.com/) | 最新安定版 | リポジトリの取得とバージョン管理に必要です。 |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) または Docker Engine | 24 以上 | Strapi を本番同様の構成で試す場合に使用します。 |

> **補足**: Windows であれば WSL2 (Ubuntu) 上での構築が安定します。Mac の場合は Homebrew を利用するとインストールが簡単です。

## 2. リポジトリを取得する
```bash
# 任意の作業ディレクトリで
git clone https://github.com/your-account/birdrock926.github.io.git
cd birdrock926.github.io
```

## 3. 環境変数ファイルを整える
Strapi と Astro では `.env` に接続情報やシークレットを保存します。まずはサンプルをコピーし、各変数の意味を理解したうえで編集しましょう。

### 3-1. CMS (/cms) の `.env`
1. サンプルをコピー
   ```bash
   cd cms
   cp .env.sample .env
   ```
   - まだ `.env` を作成していない状態で `npm run develop` を実行すると、自動的に `scripts/ensure-env.mjs` が開発用のダミー値を生成して `.env` を作成します。まずは動作確認を優先したい場合に便利ですが、本番や共有環境にデプロイする前に必ず安全なシークレットへ置き換えてください。
2. シークレット値を生成
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
   出力された値を `APP_KEYS`（4 個分をカンマで連結）、`API_TOKEN_SALT`、`ADMIN_JWT_SECRET`、`JWT_SECRET`、`HASH_PEPPER`、`ALIAS_SALT` に貼り付けます。
3. 主要項目のチェック

   | カテゴリ | 変数 | 内容 | 推奨値・例 |
   | --- | --- | --- | --- |
   | 基本 | `PUBLIC_URL` | CMS を公開する URL（OCI の Strapi では Oracle Cloud が付与するホスト名をそのまま利用） | `https://<instance>.oraclecloudapps.com` |
   | Webhook | `GITHUB_WORKFLOW_OWNER/REPO/ID/TOKEN/BRANCH` | Strapi Publish → Cloudflare Pages 用 GitHub Actions の連携設定 | `owner=your-org` など |
   | DB | `DATABASE_CLIENT` | `sqlite`（デフォルト）または `postgres` など | `sqlite` |
   | アップロード | `UPLOAD_PROVIDER` | `local` or `oci`。OCI Object Storage を使う場合は `OCI_*` を設定 | `oci` |
   | メール | `SMTP_*` | 通知メール設定 | Gmail や SendGrid 等 |
   | コメント | `COMMENTS_CLIENT_URL` / `COMMENTS_CONTACT_EMAIL` | コメント通知に使用するサイト URL と通知先メールアドレス | `https://example.pages.dev` / `contact@example.com` |
   | コメント | `COMMENTS_ENABLED_COLLECTIONS` / `COMMENTS_APPROVAL_FLOW` | コメントを許可するコンテンツタイプと承認フロー設定 | `api::post.post` |
   | コメント | `COMMENTS_MODERATOR_ROLES` / `COMMENTS_BAD_WORDS` | 通知を受け取るロール / NG ワードフィルタの有効・無効 | `Authenticated` / `true` |

   > `.env` をプレースホルダーのままにすると、Strapi が GitHub Actions 連携を自動的にスキップし、開発環境で 401 エラーが発生しません。実際に連携させたいタイミングで GitHub Secrets を発行し、`local-owner` や `github-token-placeholder` を本番値に差し替えましょう。ログに `[github] Webhook dispatch skipped` が出ていればスキップされています。

4. OCI Object Storage を利用する場合は `UPLOAD_PROVIDER=oci` とし、`OCI_PUBLIC_URL` には公開バケットのパス（末尾は `/o`）を入力します。
5. 編集が終わったら `cd ..` でプロジェクトルートに戻ります。

### 3-2. Web (/web) の `.env`
1. サンプルをコピー
   ```bash
   cd web
   cp .env.sample .env
   ```
2. 主要項目の確認

   | 変数 | 内容 | 推奨値・例 |
   | --- | --- | --- |
   | `STRAPI_API_URL` | CMS API のベース URL（空欄なら `http://localhost:1337`） | `http://localhost:1337` |
   | `STRAPI_API_TOKEN` | Strapi で発行した Read-only API トークン | `strapi_pat_xxx` |
   | `STRAPI_MEDIA_URL` | 画像のホスト URL。空欄なら `STRAPI_API_URL` を流用 | `https://objectstorage.ap-tokyo-1.oraclecloud.com/.../o` |
   | `SITE_URL` | 公開サイトの URL（Pages or 独自ドメイン） | `https://example.pages.dev` |
| `DELETE_REQUEST_FORM_URL` | 記事削除依頼フォームへのリンク | Google フォームの「回答を収集」URL（既定値は `https://forms.gle/ooWTJMdJAPiaBDNe6`） |
   | `GA_MEASUREMENT_ID` | GA4 の測定 ID。不要なら空欄 | `G-XXXXXXXXXX` |
   | `ADSENSE_CLIENT_ID` / `ADSENSE_SLOT_*` | AdSense のクライアント / 広告ユニット ID | `ca-pub-...` |
   | `PUBLIC_ADS_HEADER_BIDDING_ENABLED` | Prebid.js を使ったヘッダービディングの有効/無効 | `false`（開発）/`true`（本番） |
   | `PUBLIC_ADS_HEADER_BIDDING_UNITS` | Prebid.js の adUnits 配列（JSON 文字列） | `[{"code":"in-article",...}]` |
   | `PUBLIC_ADS_HEADER_BIDDING_TIMEOUT_MS` | 入札を待つ最大時間（ミリ秒） | `1200` |
   | `PUBLIC_ADS_GPT_NETWORK_CODE` / `PUBLIC_ADS_GPT_AD_UNIT_PREFIX` | Google Ad Manager のネットワークコードとスロットパス | `1234567` / `/1234567/game-news` |
   | `CONSENT_DEFAULT_REGION` | 同意モードの初期判定地域 | `JP` |
   | `PUBLIC_TWITCH_PARENT_HOSTS` | Twitch 埋め込みの parent 候補（カンマ区切り）。未設定時は `localhost` を自動追加 | `example.pages.dev,www.example.com` |
   | `PUBLIC_COMMENTS_ENABLED` | コメント UI の有効 / 無効 | `true` |
   | `PUBLIC_COMMENTS_REQUIRE_APPROVAL` | コメントを承認制で公開するか | `true` / `false` |
  | `PUBLIC_COMMENTS_PAGE_SIZE` / `PUBLIC_COMMENTS_MAX_LENGTH` | 1 ページあたりのスレッド数 / 投稿の最大文字数 | `50` / `1200` |
  | `PUBLIC_COMMENTS_DEFAULT_AUTHOR` | ニックネーム未入力時の表示名（記事側で上書き可能） | `名無しのユーザーさん` |

3. `STRAPI_API_TOKEN` は Strapi 管理画面の「設定 > API トークン」で `Read-only` トークンを作成して貼り付けます。
4. 編集後は `cd ..` でルートに戻ります。

#### ヘッダービディング（Prebid.js）の有効化

1. Google Ad Manager で広告ユニットを作成し、ネットワークコードとユニットのパスを確認します（例: `/1234567/game-news/in-article`）。
   - 複数枠で同じプレフィックスを使う場合は `/1234567/game-news` を `PUBLIC_ADS_GPT_AD_UNIT_PREFIX` に指定し、`code` を `in-article` / `feed` / `related` に分けると分かりやすいです。
2. `.env` を編集し、`PUBLIC_ADS_HEADER_BIDDING_ENABLED=true`、`PUBLIC_ADS_GPT_NETWORK_CODE=<ネットワークコード>`、`PUBLIC_ADS_GPT_AD_UNIT_PREFIX=<スロットプレフィックス>` を設定します。
3. `PUBLIC_ADS_HEADER_BIDDING_UNITS` に Prebid.js の adUnits 配列を JSON で記述します。
   - `code` が `InlineAd` の `placement` と一致する必要があります。既定では `in-article` / `feed` / `related` の 3 枠を用意しています。
   - `mediaTypes.banner.sizes` にサイズ一覧、`bids` に SSP ごとの `bidder` 名とパラメータ（`placementId` など）を指定します。
   - フォーマットに迷ったら `web/.env.sample` のサンプル JSON をコピーして値だけ書き換えてください。
4. 設定後に `npm run dev` または `npm run build` を再実行すると、Prebid.js が読み込まれ、入札が成功した枠は Google Ad Manager の広告が表示されます。入札がゼロの場合は自動的に AdSense にフォールバックします。
5. 動作確認はブラウザのデベロッパーツールで `pbjs.getBidResponses()` を実行し、`adserverTargeting` に値が入っているかをチェックすると確実です。

> **ワンポイント**: `web/.env` で `STRAPI_API_URL` を空欄のままにするとローカル CMS (`http://localhost:1337`) へ自動接続します。`https://cms.example.com` のようなテンプレート値が残っている場合も同様にローカルへフォールバックするため、本番公開時は必ず実際の URL を設定してください。

#### Inline Ad Slot ブロックで本文に広告を挿入する

1. Strapi の記事編集画面で Dynamic Zone の `Add a component` をクリックし、`Inline Ad Slot` を選択します。
2. `slot` には AdSense のユニット ID（数値）を入力します。ヘッダービディングを有効化している場合も必須です。
3. `placement` は Prebid.js の adUnit `code` や Google Ad Manager のスロット名を設定します（例: `in-article`）。`.env` の `PUBLIC_ADS_HEADER_BIDDING_UNITS` と合わせておくと自動でターゲティングが効きます。
4. `label` は読者に表示されるラベルです。デフォルトの「スポンサーリンク」から変更したい場合のみ編集してください。
5. `note` は編集部向けメモ欄で、公開サイトには表示されません。入稿者や広告種別の共有に活用できます。
6. ブロックを本文中の任意位置へドラッグして並べ替えます。複数挿入した場合は上から順に描画されます。
7. プレビューで広告枠の位置と余白を確認し、問題なければ Publish してください。`.env` で広告 ID を未設定の場合はラベルのみ表示されます。

#### 広告収益を伸ばすためのチェックリスト

- **SSP の追加登録**: Prebid.js の `PUBLIC_ADS_HEADER_BIDDING_UNITS` に複数の SSP を設定し、週次で応札状況を確認します。単価が低い SSP は除外するか、デバイス別ラベルで配信を絞ります。
- **Google Ad Manager のフロア調整**: イベントやセール時期に合わせて Price Priority ラインアイテムのフロア価格を見直し、`hb_pb` との組み合わせで適正な単価帯を保ちます。
- **配置の最適化**: `.ad-panel` の余白や配置位置を A/B テストし、ビューアブル率が 70% を下回る枠は本文中や関連記事付近へ再配置します。
- **収益レポートの自動化**: GA4 → BigQuery 連携を有効化し、ページ種別・時間帯ごとの RPM を可視化します。ダッシュボードを用意すると改善点が明確になります。
- **CMP と Consent Mode**: EU/UK からのアクセスが増えたら CMP（Consent Management Platform）と Consent Mode v2 を接続し、同意取得後にヘッダービディングを再リクエストできるようにします。


> `.env` はチーム共有時に漏洩しないよう、1Password・Vault 等のシークレットマネージャーで管理しましょう。メールやチャットに平文で貼り付けるのは避けてください。

## 4. 依存パッケージをインストールする
プロジェクト直下で以下のコマンドを実行すると、CMS と Web の依存が順番にインストールできます。初回は数分かかることがあります。`/cms` 側では `typescript@5.4.5` を devDependencies に含めており、`ENOENT: Cannot cd into ... /node_modules/typescript` エラーを防いでいます。

```bash
# CMS の依存をインストール
cd cms
npm install
cd ..

# Web の依存をインストール
cd web
npm install
cd ..
```

> npm 実行中に「権限がありません」エラーが出た場合は、プロジェクトを管理者権限が不要な場所 (例: `~/Projects`) に移して再実行してください。

## 5. ビルドして静的ファイルを生成する
CMS は管理画面をビルドしてから起動します。Web はビルドすると `dist/` に静的ファイルが生成されます。

```bash
# CMS のビルド
cd cms
npm run build
cd ..

# Web のビルド
cd web
npm run build
cd ..
```

`/web` 側のビルドは Node.js 20 で完走することを確認しています。`/cms` の `npm run build` も `scripts/run-strapi.mjs` により Node 20 / Windows / WSL で安定して動作するようになりました。極端にメモリが少ない環境 (2GB 未満) では Vite がクラッシュする可能性があるため、その場合は公式 `strapi/strapi:5`（Node 18 ベース）コンテナでビルドするか、ホストでビルド済みの管理画面をコピーする運用を検討してください。

> **補足ログ (2025-10-11 JST)**: 依存パッケージ未インストール環境で `cd cms && npm run develop -- --help` を実行すると `Error: Cannot find module '@strapi/strapi/package.json'` が発生します。ドキュメント更新時点では CI 環境に依存がないため、ローカルで検証するときは先に `npm install` を実行してください。


> ✅ **2025-10-02 JST 動作検証ログ**: Node.js 20.19.4 + npm 10.8 (Debian/WSL) で `npm install` → `npm run develop` → `npm run build`（/cms）と `npm install` → `npm run build`（/web）を順番に実行し、すべて成功することを確認しました。Strapi 起動時には `[github] Webhook dispatch skipped` のデバッグメッセージが表示され、GitHub 連携が未設定でも 401 が発生しないことを確認済みです。

## 6. 開発サーバーを立ち上げて確認する
### 6-1. Strapi CMS
```bash
cd cms
npm run develop
```

- ブラウザで `http://localhost:1337/admin` を開き、初回セットアップ (管理者ユーザー作成) を行います。
- `http://localhost:1337/api/posts` にアクセスすると、公開記事が JSON で返ってきます。

### 6-2. Astro Web サイト
別のターミナルを開き、以下を実行します。
```bash
cd web
npm run dev
```

- Strapi がまだ起動していなくてもコマンドが自動で待機し、CMS が利用可能になり次第サーバーが立ち上がります（既定ではタイムアウトなし。必要に応じて `STRAPI_WAIT_TIMEOUT_MS` で上限ミリ秒を指定できます）。
- ブラウザで `http://localhost:4321` を開き、トップページ・記事ページ・タグページが表示されることを確認します。
- コメント欄は Strapi に導入した **VirtusLab Comments プラグイン**の REST API を通じて読み込まれ、React UI がフォームとスレッドを描画します。表示されない場合は以下を確認してください。
  - `/cms/.env` の `COMMENTS_ENABLED_COLLECTIONS` に `api::post.post` が含まれているか、管理画面の **Settings → Comments** で Posts コレクションが有効化されているか。
  - `/web/.env` の `PUBLIC_COMMENTS_ENABLED` が `true` で、`STRAPI_API_URL` をブラウザから開いたときに `GET /api/comments/api::post.post:<entryId>` が 200 を返すか（CORS エラーが出る場合は Strapi の `config/middlewares.js` やリバースプロキシの許可ドメインを調整してください）。
  - ページ下部に「コメント識別子を取得できません」と表示される場合は、記事 API のレスポンスに `id`（必須）と `documentId`（フォールバック）が含まれているか（Strapi 側のカスタムコントローラが有効か）をチェックします。Document ID のみが返るケースでもバックエンドが自動でエントリー ID へ補正しますが、一度 CMS を再起動してログに正規化メッセージが出力されるか確認してください。
  - 400/401/403 が返るときは `COMMENTS_APPROVAL_FLOW` や `COMMENTS_BAD_WORDS` の設定で投稿が保留扱いになっていないか、API トークンの権限が不足していないかを確認してください。`Forbidden` と表示される場合は Strapi を再起動して `Public` / `Authenticated` 役割へ `Comments: Read` / `Comments: Create` が自動付与されているかチェックします。
  - コメントが `PUBLIC_COMMENTS_PAGE_SIZE` を超えて増えたら、ページネーションが表示されトップレベルスレッドごとに切り替えられることを確認してください。大量の議論でもページ送りで追いやすくなります。
  - 管理画面でコメントを「ブロック」または「削除」すると、フロントエンドでは返信のないスレッドから自動的に除外され、返信が残っている場合のみ「このコメントは管理者によって非表示になりました。」のプレースホルダーが表示されます。ブロック済みコメントが一覧に残る場合は Strapi 側でコメント状態が更新されているか、キャッシュをクリアして再読込してください。

サーバーを停止する場合は、ターミナルで `Ctrl + C` を押します。

### 6-3. Comments プラグインを有効化してコメントを確認する
1. Strapi 管理画面で **Settings → Comments** を開き、`Posts (api::post.post)` が **Enabled Collections** に追加されていることを確認します。承認制にしたい場合は **Approval Flow** にも `api::post.post` を登録し、`/web/.env` の `PUBLIC_COMMENTS_REQUIRE_APPROVAL` と一致させてください。
2. 同じ設定画面で **Client → URL** にフロントエンド（例: `https://example.pages.dev`）を入力します。通知メールを使う場合は `COMMENTS_CONTACT_EMAIL` と SMTP を設定し、保存後に反映されるまで数秒待ちます。返信が付くと入力されたメールアドレス宛に通知が飛ぶため、送信テストで迷惑メール扱いにならないかも確認しましょう。
3. Strapi 起動時の bootstrap が `Public` / `Authenticated` 役割へ `Comments: Read` / `Comments: Create` を自動付与します。ロールを手動で編集した後は、必要に応じて再起動して権限が復元されたかをチェックしてください。
4. 管理画面左側の **Comments** メニューを開き、フィルターの「Collection」で `Posts` を選択できるか確認します。投稿が無い場合は空のリストが表示されます。
5. Astro の記事ページを再読み込みし、コメントフォームが表示されることを確認します。匿名コメントを 1 件投稿し、管理画面の **Comments → Pending** に反映されるか／フロント側で承認待ちのメッセージが表示されるかをチェックしてください。
6. 送信したコメントが表示されない場合は Strapi のログにエラーがないか確認し、`COMMENTS_BAD_WORDS` や `COMMENTS_VALIDATION_ENABLED` の設定で弾かれていないか、あるいは `COMMENTS_BLOCKED_AUTHOR_PROPS` で必要なフィールドを削っていないかを見直します。
7. コメントフォームのメール欄は任意入力ですが、VirtusLab Comments 3.1.0 がメールアドレスを必須項目として検証するため、空欄や不正な値で送信した場合はフロントエンド側で `@comments.local` ドメインのダミーアドレスを生成して API リクエストを行います（ダミー宛に通知は送信されません）。バックエンドも同じドメインで不足分を補完します。返信通知を受け取りたい場合は正しいメールアドレスを入力してください（API から外部公開はされません）。
8. ニックネーム欄を空のまま投稿すると、記事の「コメント用デフォルト名」フィールドに設定した名前が自動で使われます（未設定時は `PUBLIC_COMMENTS_DEFAULT_AUTHOR` の値が適用されます）。記事ごとに匿名表示名や本文フォントサイズを変えたい場合は Post エディタで該当フィールドを更新してください。
9. コメントタブを開いた瞬間に `A valid integer must be provided to limit` が延々と表示される場合は、Strapi 側の拡張（`cms/src/extensions/comments/strapi-server.js`）でクエリの `limit` / `pagination[pageSize]` が正規化されているか確認してください。数値以外が送られても 50 件（最大 200 件）にクランプされ、Knex の警告が原因のリロードループを防げます。フロントエンドのフェッチロジック（`web/src/lib/comments.ts`）も 1〜200 件の範囲へ丸めるため、値を変えたい場合は両方を同じ上限に合わせてください。


### 6-4. ブロックエディタで装飾する
- Strapi の記事フォームでは **Dynamic Zone** を利用しており、`Rich Text` のほかに以下のブロックが追加済みです。
  - **Colored Text**：公式 Color Picker プラグインのカラーフィールドで文字色／背景色を決定し、ラベルをワンポイントで強調できます。
    - `isInline` をオンにすると段落内の短いハイライトとして扱えます。
  - **Callout**：トーン（Info / Success / Warning / Danger）と任意のアイコン文字列を設定し、注意喚起ボックスを作成します。
  - **Columns**：2〜3 カラムのレイアウトを組めるブロックです。各カラムに見出し＋本文（Rich Text コンポーネント）を配置できます。
  - **Separator**：セクションの区切り線や「続きはこちら」といったラベルを表示します。
  - **Inline Ad Slot**：記事本文内に広告枠を差し込むブロック。`slot` に AdSense のユニット ID、`placement` に Prebid.js / GAM のコードを入力すると、Web 側で `InlineAdBlock` が描画されます。`label` で表示名、`note` で運用メモを残せます。
- Rich Text ブロックの `fontScale` は Strapi 標準の Decimal 入力で 0.7〜1.8 の範囲を直接入力できます。空欄にすると記事の `bodyFontScale` 設定を継承します（既定 1.0 倍）。
- `alignment` フィールドは `left` / `center` / `right` / `justify` のいずれかを選択でき、段落や画像の整列方法を制御します。未設定時は `left` を使用します。
- 画像やギャラリー、YouTube / Twitch 埋め込みブロックもこれまで通り利用できます。プレビューで並び順・余白が崩れていないか確認しましょう。
- Figure / Gallery ブロックには「表示モード」が追加されており、`GIF` を選ぶとアニメーション GIF が劣化なく再生されます。通常は `Auto` のままで MIME を自動判定します。
- 記事の **Slug（URL）** フィールドは日本語やハイフン入りの任意文字列をそのまま利用できます。重複する場合は自動的に `-2` などの連番が付きます。
- Rich Text ブロックは Markdown の太字（`**bold**`）、斜体（`_italic_`）、取り消し（`~~strike~~`）、インラインコード（`` `code` ``）、リスト、引用、画像、リンクを `marked` ベースのレンダラーで HTML に整形し、Shift+Enter の改行も `<br>` として表示します。プレビューで段落や装飾が期待通りに反映されているか確認してください。
- 記事一覧のカードには 4:3 のカバー画像が自動表示され、最大幅は 16rem（約 256px）に抑えています。ギャラリーブロックも 140px 以上のサムネイルで整列するため、長辺 1,280px 程度までにリサイズした画像をアップロードするとフィード全体のバランスが整います。
- 文字色や背景色は 16 進カラーコードで保存されるため、Web 側でも同じ色で再現されます。実際の公開ページで読みづらくならないよう、彩度の高い色は Callout や Columns で背景を調整するのがおすすめです。
- 関連記事ウィジェットは「記事 3 件：広告 1 枠」の配列になるよう自動整列します。AdSense の関連コンテンツ枠 ID を `.env` の `ADSENSE_SLOT_RELATED` に設定したうえで、Strapi 側で関連記事を 3 件以上紐付けると自然なカード列になります。
- 記事詳細の右上には「削除依頼」「共有」メニューが表示されます。フォーム URL は `DELETE_REQUEST_FORM_URL` を変更（既定では `https://forms.gle/ooWTJMdJAPiaBDNe6` を使用）、SNS 共有テキストは記事タイトルとサイト名を自動結合します。公開前にフォームの公開範囲と URL を確認してください。

### 6-5. VirtusLab Comments 管理のコツ
- 管理画面の **Comments → Overview / Pending / Approved / Rejected / Reported** を使い分けると、承認待ち・公開済み・却下済み・通報中のステータスを一目で確認できます。承認制の場合は `Pending` から **Approve** / **Reject** を実行すると、フロントの表示も数秒で更新されます。
- コメントのステータスは行末メニューの **Change status** か詳細ドロワーの `Status` セレクトで切り替えます。公開済みコメントを `Pending` に戻して差し戻すこともできます。
- 推奨オペレーション例：
  1. **毎朝** `Pending` を確認して保留コメントを裁き、必要なら `Block user` や `Block thread` でスパムを封じます。
  2. **通報が来たら** `Reported` タブで内容を確認し、対応後に **Report resolved** を押下。`COMMENTS_CONTACT_EMAIL` に通知先を設定し、SMTP を構成しておくとメールで即時把握できます。
  3. **週次**で `Overview` をエクスポート（CSV/JSON）し、NG ワードやリンクスパムの傾向を分析。`COMMENTS_BAD_WORDS` や自動モデレーション設定の改善に役立ててください。
- フロントエンドの「通報する」ボタンから送られたレポートは `Reported` タブに即時追加されます。`reason`（通報理由）と `content`（詳細）が届くので、必要に応じて `Block user` / `Block thread` / `Delete` を実行して対応してください。
- 各コメントのアクションメニューから「Block thread」「Block user」「Edit」などを実行できます。`COMMENTS_BLOCKED_AUTHOR_PROPS` に `email` や `ip` を含めておくと、指定フィールドをキーに投稿を拒否できます。
- **Settings → Plugin configuration** で `Bad words filter` や `Validation rules` を調整し、承認フローと組み合わせてガイドラインを運用します。レートリミットを厳しめに設定するとボット連投を防ぎやすくなります。
- コメントデータは Strapi の DB に保存されます。月次で Content Manager のエクスポート機能や `strapi export` を使ってバックアップし、必要に応じて OCI のスナップショットとも併用してください。



## 7. OCI Always Free で CMS を公開する
ここでは、OCI の無料枠を使って Strapi を常駐させるまでの流れを初心者向けに整理します。作業時間は 60〜90 分程度を見込んでください。

### 7-1. アカウントとテナンシを準備する
1. [OCI サインアップ](https://www.oracle.com/cloud/free/) でアカウントを作成し、クレジットカードと本人確認情報を登録します。無料枠内であれば課金されません。
2. 初回ログイン後にリージョン（例: `ap-tokyo-1`）を選択し、使用する **Compartment**（論理フォルダ）を把握しておきます。既定の `root` のままでも構いません。

### 7-2. Object Storage を構築する
README の「OCI Object Storage の事前準備」を参考に、バケットとアクセスキーを作成します。無料枠では 20GB まで利用でき、Cloudflare Pages の帯域節約に有効です。

### 7-3. Compute インスタンスを作成する
1. コンソールの **Compute → Instances** で `Create Instance` をクリックします。
2. `Always Free Eligible` のマシンタイプを選択（ARM の `VM.Standard.A1.Flex` を推奨）。OCPU=1、メモリ=6GB ほどに設定します。
3. ネットワークは既定の VCN を利用し、`Assign a public IPv4 address` にチェックを入れておきます。
4. SSH 公開鍵をアップロードまたは貼り付けて `Create` します。完了後に表示されるパブリック IP をメモしておきます。

### 7-4. インスタンスへ接続し必要なソフトを入れる
```bash
ssh -i ~/.ssh/oci-key opc@<public-ip>

# システム更新
sudo dnf update -y    # Ubuntu の場合は apt update && apt upgrade -y

# Node.js / Git / Docker を導入
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs git docker docker-compose-plugin

# Docker を起動し、現在のユーザーを docker グループに追加
sudo systemctl enable --now docker
sudo usermod -aG docker opc
exit

# 権限反映のため再接続
ssh -i ~/.ssh/oci-key opc@<public-ip>
```

### 7-5. プロジェクトを配置し `.env` を設定する
```bash
git clone https://github.com/your-account/birdrock926.github.io.git
cd birdrock926.github.io
cp cms/.env.sample cms/.env
# `nano` や `vim` で cms/.env を開き、本番用の値 (ドメインや OCI_* など) を貼り付ける
```

### 7-6. Docker Compose で Strapi を起動する
```bash
cd infrastructure
cp ../cms/.env .env  # docker-compose からも読み込めるようコピー

docker compose pull           # 依存イメージ取得
docker compose up -d          # バックグラウンド起動

docker compose logs -f strapi # 初回起動ログを監視
```
起動後、ブラウザで `http://<public-ip>:1337/admin` にアクセスして管理ユーザーを作成できます。Caddy を同梱の設定ファイルで有効化すると HTTPS で公開可能です。

### 7-7. ドメインと HTTPS を整える
1. 独自ドメインの DNS で A レコードを OCI インスタンスのパブリック IP に向けます。
2. `infrastructure/Caddyfile` の `cms.example.com` を使用するドメインに置き換え、以下で適用します。
   ```bash
   sudo cp Caddyfile /etc/caddy/Caddyfile
   sudo systemctl enable --now caddy
   ```
3. 数分後に `https://cms.example.com/admin` が開ければ成功です。Caddy が自動で Let's Encrypt 証明書を取得します。

### 7-8. セキュリティの最終確認
- OCI のセキュリティリスト／NSG に 80/443/1337 の受信ルールがあるか確認
- `sudo firewall-cmd --add-service=http --add-service=https --permanent && sudo firewall-cmd --reload`
- Strapi 管理画面のデフォルトロールを公開 API 用に調整し、Admin ロールには強力なパスワード＋ MFA を設定

### 7-9. GitHub Actions 連携を有効にする
Strapi の設定画面で Webhook を作成し、`Publish event` にフックさせて GitHub Actions の `workflow_dispatch` を叩くよう `.env` の `GITHUB_WORKFLOW_*` を設定します。テストとしてダミー記事を公開し、Cloudflare Pages が自動更新されるか確認しましょう。

## 8. Cloudflare Pages へのデプロイ (概要)
1. Cloudflare ダッシュボードの **Workers & Pages → Pages** で `Create project` をクリックし、**Direct Upload** を選択してプロジェクト名（例: `game-news-web`）を登録します。初回は手動で ZIP をアップロードする必要はなく、GitHub Actions からのデプロイを待つだけで構いません。
2. **Profile → API Tokens** から `Create Token` を押し、テンプレート `Cloudflare Pages - Create Deployments` を利用して API トークンを発行します。発行後は一度しか表示されないため、安全な場所に保管してください。
3. 同じ画面でアカウント ID を確認し、GitHub リポジトリの **Settings → Secrets and variables → Actions** に以下を登録します。
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_PAGES_PROJECT`（手順1で決めたプロジェクト名）
   - `CLOUDFLARE_API_TOKEN`（手順2で発行したトークン）
   - `CLOUDFLARE_PAGES_BRANCH`（任意。省略すると `github.ref_name` が利用されます）
4. `.github/workflows/deploy-web.yml` は push / workflow_dispatch / schedule をトリガに Astro をビルドし、`cloudflare/pages-action` で `web/dist` をアップロードします。Action 実行後に Cloudflare Pages のダッシュボードで `Production` デプロイが成功しているか確認してください。
5. Strapi Webhook (`GITHUB_WORKFLOW_*`) が成功すると、Publish → GitHub Actions → Cloudflare Pages 更新の一連の流れが自動化されます。

### 8-1. 独自ドメインを割り当てる
Cloudflare Pages ではプロジェクト単位でカスタムドメインを追加できます。ここでは `news.example.com` を割り当てる例を示します。

1. Cloudflare ダッシュボードの対象プロジェクトで **Custom domains → Set up a custom domain** を開き、`news.example.com` を入力します。
2. Cloudflare DNS を利用している場合は **Automatic (CNAME)** を選択すると DNS レコードが自動作成されます。外部 DNS の場合は、表示される `CNAME` レコード（値は `<project>.pages.dev`）を手動で登録してください。
3. ルートドメインを割り当てる場合は Cloudflare の **CNAME Flattening** を有効化するか、外部 DNS の ALIAS / ANAME 機能を利用します。
4. DNS が伝播すると Cloudflare Pages のダッシュボードで `Active` と表示され、`https://news.example.com` にアクセスすると Cloudflare が発行した証明書で HTTPS 接続できます。
5. `web/.env` を更新して `SITE_URL=https://news.example.com` とし、`PUBLIC_TWITCH_PARENT_HOSTS` に `news.example.com` を追加したら `npm run build` を再実行します。

> **メモ**: Cloudflare DNS を利用する場合は SSL/TLS モードを `Full (Strict)`、`Always Use HTTPS` を有効化し、キャッシュが古いときは `Purge Cache` を利用して更新してください。外部 DNS を利用する場合も、Cloudflare Pages 側のステータスが `Active` になっているか必ず確認しましょう。


## 9. トラブルシューティング
| 症状 | 対処 |
| --- | --- |
| `npm install` で `sharp` のビルドに失敗する | Node.js 20 用のビルドツールが不足しています。Mac なら `xcode-select --install`、Windows なら `npm install --global windows-build-tools` を実行。 |
| `ENOTEMPTY: directory not empty` が表示される | `rm -rf node_modules` を実行してから `npm install --no-progress` を再実行します。npm の既知の挙動で、2 回目のインストールで解決するケースがほとんどです。 |
| Strapi 起動時に DB 接続エラー | `.env` の `DATABASE_*` 設定を見直し、SQLite の場合はパスに書き込み権限があるか確認。 |
| Astro のビルドで API 呼び出しが 401 になる | `web/.env` の `STRAPI_API_TOKEN` が正しいか確認し、Strapi で公開ロールの権限を設定。 |

## 10. 次のステップ
- Strapi の管理画面から記事やタグを作成し、公開ワークフローを体験します。
- Web 側で `npm run preview` を実行すると、本番同等の静的ファイルをローカルで確認できます。
- Consent Mode や ads.txt の設定値を本番用に差し替えて、収益化・コンプライアンス対応を進めましょう。

---
このガイドに沿って一度セットアップを完了すれば、以降は更新作業に集中できます。困ったことがあれば README の運用ランブックや Strapi ドキュメントを参照してください。
