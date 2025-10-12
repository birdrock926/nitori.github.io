# プロジェクト概要

## 目的（What & Why）
- **ゲームニュース／配信まとめ**を、**高速・低コスト**かつ**運用しやすい GUI**で継続発信し、**検索流入＋SNS拡散でインプレッションを獲得**。  
- **匿名コメント**を Strapi の VirtusLab Comments プラグインで安全に受け付け、**モデレーションや通知**を Strapi 管理画面で完結。
- **Google 広告**と **SEO/ニュース露出**を意識した情報設計で、**収益化の地力**を作る。

## 成果物（Deliverables）
- **公開サイト**：Cloudflare Pages で配信される**静的サイト**（Astro + React Islands）
- **管理システム**：OCI 無料枠上の **Strapi v5**（GUI で記事・画像・ブロックを管理）
- **コメント基盤**：Strapi 向け **VirtusLab – Comments** プラグイン（管理画面と統合されたモデレーション UI・メール通知・承認フロー）
- **自動公開ライン**：Strapi Publish → Webhook → GitHub Actions → Pages 反映
- **広告/同意**：ads.txt・AdSense タグ／Consent Mode v2 導線（CMP 連携フック）

## ターゲット
- ゲーム情報の**要点だけ素早く**掴みたい読者  
- Twitch/YouTube の**“今すぐ見たい”導線**を求める視聴者  
- 運営側（あなた）：**GUI で書く→プレビュー→公開**までの摩擦を最小化したい

## アーキテクチャ（High Level）
- **フロント（/web）**：Astro SSG
  - 記事は**Strapi の published のみ**をビルド時取得
  - **Dynamic Zone**を React コンポーネントにマップ（RichText / ColoredText / Figure / Gallery / Columns / Callout / Separator / Twitch / YouTube / Inline Ad Slot）
- **コメント**は Strapi Comments API（VirtusLab プラグイン）を REST で取得・投稿し、記事の **Document ID** をスレッドキーとして利用（数値エントリー ID や slug が渡された既存レコードも起動時に自動で Document ID へ補正）。React 島がフォームとツリー UI を提供。
- **CMS（/cms）**：Strapi v5
  - 記事・タグ・メディア・埋め込みブロックを GUI で管理
  - **Webhook** が GitHub Actions を起動し、Cloudflare Pages へ再デプロイ
- **コメント基盤（Strapi Comments）**
  - Strapi プラグインとして提供され、記事単位のツリー表示・通報・承認フローを Strapi 管理画面内で操作可能。
  - 公開 REST API 経由で匿名ユーザー投稿（任意の表示名・メール）とネストした返信を受け付け、通知メールや不適切ワードフィルタリングに対応。
- **インフラ**  
  - **OCI Always Free**：Strapi 常駐（Docker Compose）  
  - **Cloudflare Pages**：本番ホスティング（GitHub Actions でビルド＆デプロイ）

## 主要機能
### コンテンツ編集（GUI）
- **WYSIWYG + ブロック構成**（Dynamic Zone）
- Slug（URL）は日本語や記号混じりの任意文字列を保持し、重複時は自動で `-2` などの連番を付与
- 公式 **Color Picker プラグイン** + 「色付きテキスト」「コールアウト」「カラム」ブロックでピンポイントな強調やレイアウトを調整
- 画像は**ドラッグ＆ドロップ**、自動リサイズ/WebP/AVIF/LQIP
- **Twitch/YouTube** は ID/URL 入力だけで埋め込み（16:9・lazyload・アクセシブル）
- **Draft/Publish**、公開予約（publishedAt）、タグ分類、関連記事自動
  - RichText ブロックの本文倍率は 2025-10-27 時点でローカルカスタムフィールド群を撤去し、Strapi 標準の **Decimal** 入力へ戻しました。Windows 環境で `Unsupported field type: plugin::font-scale-range.scale` が継続したことが直接の原因で、現在は管理画面の数値入力に 0.7〜1.8 の範囲を設定して直接倍率を記入します。空欄の場合は記事全体の既定値 (1.0 倍) を自動継承します。履歴と検証手順は AGENTS.md を参照してください。

### 匿名コメント（Strapi Comments）
- **任意の表示名 + メール（任意・通知専用）**で匿名投稿を受け付け、ツリー構造の返信を自動整形。メールアドレスは返信通知にのみ利用され、API レスポンスには含めません。
- **Strapi 管理画面**内のプラグインタブからコメントの承認／削除／エディット／通報確認／エクスポートを一元管理。
- **通知・モデレーション機能**：NG ワードフィルタ、承認フロー、通報メール（`COMMENTS_CONTACT_EMAIL`）を設定可能。
- **REST API**：`/api/comments/api::post.post:<documentId>` を Astro 側が呼び出し、React 島が UI と投稿フォームを提供（数値エントリー ID や slug を指定した古い投稿は自動で Document ID へ補正し、必要に応じてフォールバックします）。
- **通報フォーム**：フロントエンドの各コメントに「通報する」ボタンを配置し、読者が理由と詳細を添えてモデレーターへ報告できるようにしました。
- **本文レンダリング**：Markdown の `![]()` や画像 URL を貼ると自動でサムネイル表示しつつ、長文は「…続きを読む」で折りたためます。管理側でコメントを「ブロック/削除」した場合は返信のないツリーから自動的に除外し、返信が残っているときだけ「このコメントは管理者によって非表示になりました。」のプレースホルダーを表示します。

### SEO / 収益
- `NewsArticle`/`Article` **JSON-LD**、OGP 自動生成、サイトマップ/RSS
- **AdSense**：`ads.txt` 雛形・密接配置回避コンポーネント
- **Prebid.js + Google Ad Manager** を利用したヘッダービディング設定を内蔵し、リアルタイム入札での単価最適化が可能
- **Consent Mode v2** フック（EEA/UK 対応を将来有効化しやすい構成）

### UI/UX（読者体験）
- テーマ（ライト/ダーク）・読みやすいタイポ・スケルトン/LQIP・アクセシビリティ AA 準拠  
- トップ：ヒーロー＋最新カード＋ライブ配信セクション＋ランキング  
- 記事：目次自動 / 削除依頼ボタン＆シェアメニュー / 関連記事（広告 3:1 混在） / コメント島（控えめ UI）
  - Rich Text ブロックの本文倍率は管理画面の `fontScale` 数値入力で調整でき、未設定時は記事既定値 (1.0 倍) を自動適用

## データモデル（抜粋）
- **Post**：`title, slug, summary, cover, tags[], blocks(DZ), author, publishedAt, commentDefaultAuthor, bodyFontScale`
- **Tag**：`name, slug`（記事との多対多）
- **Embed / Media Components**：`RichText, ColoredText, Figure, Gallery, Columns, Callout, Separator, TwitchLive, TwitchVod, YouTube`
  - Figure/Gallery には `表示モード`（Auto/Image/GIF）を追加し、GIF アニメを劣化なく再生・配信できます
- RichText ブロックの `fontScale` は Strapi 標準の Decimal フィールドです。0.7〜1.8 の範囲で倍率を入力でき、空欄（NULL）のままにすると記事既定値 (1.0 倍) を自動的に適用します。カスタムフィールド版で発生していた Windows 向けの「プラグイン未インストール」「Unsupported field type」エラーは、この戻し対応で解消されました。詳細な移行手順と検証ログは AGENTS.md にまとめています。
- Rich Text ブロックの本文は CKEditor 由来の Markdown 互換テキストを `marked` ベースのレンダラーで HTML に変換します。太字/斜体/取り消し線/インライン・ブロックコード/引用/リンク/画像/リスト/改行をサポートし、Strapi からプレーンテキストが返ってきても公開ページでは装飾を保持します。描画時にも同じ正規化を再実行し、`<p>` や `<br>` だけでラップされた Markdown 断片は一旦剥がしてから再評価するため、`**bold** _italic_` などが素のまま表示されることはありません。2025-11-04 の追補で Markdown の再評価を常に決定的な手順（単純な HTML ラッパーを剥がしたうえで `marked` を実行し、変換結果と元テキストを比較）に統一し、SSR/CSR で完全に同じ HTML が生成されるよう調整したため、ハイドレーション警告や記号の生表示が再発しません。
- **コメント**：Strapi プラグイン（strapi-plugin-comments）が `plugin::comments.comment` として保存し、記事 (`api::post.post`) の Document ID（数値エントリー ID や slug からの自動フォールバック付き）と紐付け

## ワークフロー
1. **編集**：Strapi GUI で記事作成 → 画像アップ → ブロック配置 → 下書き保存  
2. **公開**：Publish → Strapi Webhook が **GitHub Actions** をトリガ  
3. **配信**：Astro が API（published のみ）を取得 → Pages へ静的出力  
4. **UGC**：読者が匿名コメント → Comments プラグインが即時反映（承認フローを有効にした場合は保留） → Strapi 管理画面で公開/削除
5. **保守**：Actions の定期実行（予約公開・ランキング更新）／ログ/アナリティクス確認

## 非機能要件（SLO/品質）
- **パフォーマンス**：トップ LCP < 2.0s、記事 LCP < 2.5s（デスクトップ目安）  
- **可用性**：CMS 落ちても**公開サイトは静的で継続**  
- **スケール**：Strapi Comments プラグイン（SQLite / PostgreSQL）で 10 万件規模のスレッドも安定表示
- **セキュリティ**：CSP/Referrer-Policy/XCTO、最小 CORS、管理画面は OAuth + IP 制限可  
- **ログ/監査**：モデ操作・BAN/通報・失敗レートを構造化ログで保存

## ローンチチェックリスト（抜粋）
- 独自ドメイン/HTTPS、`ads.txt`/AdSense、構造化データ検証、CMP/Consent Mode v2、
  Comments プラグインの公開 API 権限・通知メール・承認フロー設定、404/500/検索・タグ導線

## ロードマップ（提案）
- Phase 1：初期公開（記事/配信まとめ・匿名コメント・基本広告）  
- Phase 2：ランキング集計・関連記事強化・SNS 自動投稿  
- Phase 3：Object Storage へのメディア移行・多言語/リージョン配信・ニュース面最適化

## 期待KPI（例）
- 30/60/90日：UU・PV・平均滞在・直帰率・広告表示/収益・通報率・モデ負荷  
- 技術指標：LCP/CLS、エラー率、ビルド所要、Webhook→反映遅延

---

# セットアップガイド

本リポジトリは Strapi v5 を用いた CMS(`/cms`) と Astro + React Islands を用いたフロントエンド(`/web`) のモノレポです。OCI Always Free 上で稼働する Docker Compose 構成、および Cloudflare Pages への静的デプロイに対応しています。

> **最終検証 (2025-10-02 JST)**: Node.js 20.19.4 + npm 10.8 系 (Debian/WSL 相当) で `/cms`・`/web` の `npm install` / `npm run build` を実行し、さらに `/cms` の `npm run develop` も起動確認しました。`scripts/run-strapi.mjs` により Node 20 + Windows/WSL 環境でも `ERR_UNSUPPORTED_DIR_IMPORT` が発生せず、管理画面ビルドも完走することを再検証済みです。ログには `admin.auth.options.expiresIn` の非推奨警告が表示されますが動作に影響はありません。
>
> **補足ログ (2025-10-11 JST)**: 依存パッケージ未インストール状態で `cd cms && npm run develop -- --help` を実行すると `Error: Cannot find module '@strapi/strapi/package.json'` が発生することを確認。ドキュメント追従時点では CI 環境に依存が存在しないため、ローカル/本番で検証する際は事前に `npm install` を実行してください。

## 事前要件
- Node.js 20 LTS
- npm 10 以上
- Docker / Docker Compose v2（CMS 本番運用時）
- GitHub Actions を利用可能な GitHub リポジトリ
- Comments プラグイン用の公開 URL (`COMMENTS_CLIENT_URL`) と通知先メール (`COMMENTS_CONTACT_EMAIL`)

## ディレクトリ構成
- `/cms` — Strapi v5 プロジェクト（記事・タグ・メディア管理）
- `/web` — Astro SSG + React Islands
- `/infrastructure` — Docker Compose, systemd, Caddy 設定など。2025-10-26 に Compose/Caddy/systemd の設定を再点検し、OCI 常駐環境と Cloudflare Pages 連携で引き続き利用していることを確認したため、リポジトリから削除せず維持します。
- `/public` — 共有公開アセット（ads.txt 雛形など）

---

# 環境変数

各パッケージ直下に `.env.sample` を用意しています。必要な値を `.env` に複製し、値を設定してください。以下に、プロジェクトで利用する主な環境変数と推奨する設定手順をまとめます。

### /cms 用 `.env`
1. サンプルをコピーします。
   ```bash
   cd cms
   cp .env.sample .env
   ```
> **Memo**: `.env` を作成していなくても `npm run develop` を実行すると、`scripts/ensure-env.mjs` が開発用のダミー値を自動生成して `.env` に書き出します。生成値はローカル動作確認専用なので、本番環境にデプロイする前に必ず置き換えてください（`COMMENTS_CLIENT_URL` や `COMMENTS_CONTACT_EMAIL` なども同様）。
2. `node` コマンドで乱数を生成し、シークレットに設定します。
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
   出力された 96 桁の 16 進文字列を `APP_KEYS`（4 個ぶんをカンマ区切り）、`API_TOKEN_SALT`、`ADMIN_JWT_SECRET`、`JWT_SECRET`、`HASH_PEPPER`、`ALIAS_SALT` に割り当ててください。
3. 代表的なキーの説明:

   | 変数名 | 説明 | 例 |
   | --- | --- | --- |
   | `PUBLIC_URL` | CMS を公開する URL。HTTPS で運用します。 | `https://cms.example.com` |
   | `GITHUB_WORKFLOW_*` | Cloudflare Pages への再デプロイを呼び出す GitHub Actions 情報。 | `OWNER=your-account` 等 |
   | `DATABASE_CLIENT` | `sqlite`（デフォルト）または `postgres` 等。 | `sqlite` |
   | `UPLOAD_PROVIDER` | `local` or `oci`。OCI Object Storage を使う場合は以下の OCI_* を設定。 | `oci` |
   | `OCI_*` 一式 | OCI Object Storage のバケット情報・認証キー。 | 公式ドキュメント参照 |
   | `SMTP_*` 一式 | Strapi から通知メールを送る際の SMTP 情報。 | `smtp.gmail.com` / `587` |
   | `COMMENTS_CLIENT_URL` / `COMMENTS_CONTACT_EMAIL` | コメントメール内のサイト URL と通知先アドレス。 | `https://example.pages.dev` / `contact@example.com` |

> **開発時の GitHub Webhook**: `.env` が同梱プレースホルダー（`local-owner` / `local-repo` / `dispatch-workflow.yml` / `github-token-placeholder` など）のままの場合、Strapi は GitHub Actions 連携を自動的にスキップし、開発時の 401 エラーを防ぎます。実運用では GitHub Secrets を発行し、これらを本番値に置き換えてください。スキップ時はログに `[github] Webhook dispatch skipped` が出力されます。

4. `UPLOAD_PROVIDER=oci` を使う場合は、OCI コンソールで作成したユーザーのアクセスキーとシークレットを `OCI_ACCESS_KEY`, `OCI_SECRET_KEY` に設定し、`OCI_PUBLIC_URL` に公開バケットのベース URL を入力してください。
5. `.env` を保存したら `cd ..` でプロジェクトルートに戻ります。

#### OCI Object Storage の事前準備（初回のみ）
帯域の節約と画像配信の安定化を目的として、Strapi のアップロード先を OCI Object Storage に切り替える場合は以下の手順でバケットと認証情報を用意します。

1. [OCI コンソール](https://cloud.oracle.com/) にログインし、左上のハンバーガーメニューから **Object Storage** → **Buckets** を開きます。
2. `Always Free` リージョン（例: `ap-tokyo-1`）と対象の **Compartment** を選択し、`Create Bucket` をクリックします。
3. バケット名（例: `game-news-media`）を入力し、ストレージクラスは `Standard` のまま作成します。`Public access type` は `Public` を選択し、**`Enable Object Listing`** にチェックを入れておきます。
4. バケット画面右上の `Bucket Information` から `Namespace` と `Object Storage URL` を控えます。これが `.env` の `OCI_NAMESPACE` と `OCI_PUBLIC_URL` の基礎となります。
5. メニューの **Identity & Security → Users** でメディア配信用の専用ユーザーを作成し、`Auth Tokens` タブから `Generate Token` をクリックしてアクセスキー（`OCI_ACCESS_KEY`）とシークレット（`OCI_SECRET_KEY`）を発行します。表示は一度きりなので安全な場所に保存してください。
6. 同じ画面の **Groups** で新しいグループ（例: `StrapiUploaders`）を作成し、先ほどのユーザーを所属させます。
7. **Policies** で次のようなポリシーを追加し、バケットへの読み書き権限を付与します。
   ```
   Allow group StrapiUploaders to manage objects in compartment <COMPARTMENT_NAME> where target.bucket.name='<BUCKET_NAME>'
   ```
8. `.env` の `OCI_REGION`, `OCI_NAMESPACE`, `OCI_BUCKET`, `OCI_PUBLIC_URL`, `OCI_ACCESS_KEY`, `OCI_SECRET_KEY` を上記の値に更新します。`OCI_PUBLIC_URL` は `https://objectstorage.<region>.oraclecloud.com/n/<namespace>/b/<bucket>/o` の形式です。
9. 画像配信に利用するドメインを `PUBLIC_FRONT_ORIGINS` と `CORS_ALLOWED_ORIGINS` に追加し、Strapi からの配信が許可されていることを確認します。

> **Tip**: バケットを `Public` にしたくない場合は、OCI の CDN または Cloudflare R2 + Signed URL などの代替構成を検討してください。その場合は Strapi のカスタムアップローダーを拡張する必要があります。

### /web 用 `.env`
1. サンプルをコピーします。
   ```bash
   cd web
   cp .env.sample .env
   ```
2. 主要なキーの説明:

   | 変数名 | 説明 | 例 |
   | --- | --- | --- |
   | `STRAPI_API_URL` | CMS の公開 API エンドポイント。空欄の場合は自動で `http://localhost:1337` を参照します。 | `http://localhost:1337` |
   | `STRAPI_API_TOKEN` | Strapi で発行した API Token（Public 読み取り用）。 | `strapi_pat_xxx` |
   | `STRAPI_MEDIA_URL` | 画像配信用のベース URL。空欄の場合は `STRAPI_API_URL` と同じ値を利用します。 | `https://objectstorage.ap-tokyo-1.oraclecloud.com/n/your-namespace/b/your-bucket/o` |
   | `SITE_URL` | Cloudflare Pages や独自ドメインの公開 URL。 | `https://example.pages.dev` |
   | `DELETE_REQUEST_FORM_URL` | 記事削除依頼フォーム（Google フォーム等）の URL。 | `https://docs.google.com/forms/d/.../viewform` |
   | `PUBLIC_TWITCH_PARENT_HOSTS` | Twitch 埋め込みで `parent` に指定するホスト名。カンマ区切りで公開サイトのドメインを列挙。未設定時は `localhost` を自動追加します。 | `example.pages.dev,www.example.com` |
| `PUBLIC_COMMENTS_ENABLED` | コメント UI の表示フラグ。`false` にするとコメント欄を非表示にできます。 | `true` |
| `PUBLIC_COMMENTS_PAGE_SIZE` / `PUBLIC_COMMENTS_MAX_LENGTH` | コメント取得件数（1 ページに表示するスレッド数）/ 投稿の最大文字数 | `50` / `1200` |
| `PUBLIC_COMMENTS_DEFAULT_AUTHOR` | ニックネーム未入力時に使うデフォルト表示名。記事側で個別に上書きできます。 | `名無しのユーザーさん` |
   | `GA_MEASUREMENT_ID` | Google Analytics 4 の測定 ID（利用しない場合は空欄可）。 | `G-XXXXXXXXXX` |
   | `ADSENSE_CLIENT_ID`, `ADSENSE_SLOT_*` | Google AdSense のクライアント ID と広告ユニット ID。未導入の場合は空欄で OK。 | `ca-pub-...` |
   | `PUBLIC_ADS_HEADER_BIDDING_ENABLED` | ヘッダービディング（Prebid.js）の有効化フラグ。 | `false`（開発時）/`true`（本番） |
   | `PUBLIC_ADS_HEADER_BIDDING_UNITS` | Prebid.js に渡す入札ユニットの JSON 配列。`code`（配置名）と `bids` を設定。 | `[{"code":"in-article",...}]` |
   | `PUBLIC_ADS_HEADER_BIDDING_TIMEOUT_MS` | 入札待機のタイムアウト（ミリ秒）。 | `1200` |
   | `PUBLIC_ADS_GPT_NETWORK_CODE` / `PUBLIC_ADS_GPT_AD_UNIT_PREFIX` | Google Ad Manager（旧 DFP）のネットワークコードとスロットパス。 | `1234567` / `/1234567/game-news` |
   | `CONSENT_DEFAULT_REGION` | 同意ステータスの初期値を決める地域コード。 | `JP` |

3. `STRAPI_API_TOKEN` は Strapi 管理画面の「設定 > API トークン」から `Read-only` で発行し、ヘッダー `Authorization: Bearer <token>` で利用できるものを貼り付けます。
4. `.env` 保存後は `cd ..` でルートに戻ります。

### Comments プラグインの設定

`strapi-plugin-comments` を標準バンドルしており、`config/plugins.js` で `api::post.post` に対して有効化済みです。Strapi とフロントエンドでコメント機能を利用する際は次のポイントを確認してください。

1. `.env` の `COMMENTS_ENABLED_COLLECTIONS` にはコメント対象のコンテンツタイプをカンマ区切りで指定します。空文字列や `[]`/`null` といったプレースホルダーは自動的に除外され、`api::post.post` が常に残るため、対象を意図せず無効化することがありません。
2. `.env` の `COMMENTS_CLIENT_URL` / `COMMENTS_CONTACT_EMAIL` を実運用の URL / 連絡先に更新します（開発では `scripts/ensure-env.mjs` がプレースホルダーを自動生成します）。
3. Strapi 管理画面へログインし、左メニューの **Plugins → Comments** でモデレーションポリシー（承認フロー、禁止ワード、通知先など）を調整します。承認フローを有効にするとコメントは「保留」として保存され、公開操作を行うまでフロントには表示されません。
4. `Settings → Users & Permissions → Roles → Public` で `Comments: Read` / `Comments: Create` / `Comments: Report abuse` 権限が有効になっていることを確認します（`cms/src/index.js` の bootstrap が `Public` / `Authenticated` 役割に自動付与しますが、権限を手動で編集した場合は再設定してください）。
5. VirtusLab Comments は GraphQL プラグインを内部で利用するため、`cms/config/plugins.js` で `graphql` を常に有効化しています。GraphQL を削除・無効化すると管理画面のコメント一覧が空白になるので注意してください。
6. コメント API のベース URL は `https://<CMS>/api/comments/api::post.post:<documentId>` です。Astro 側は記事の Document ID をスレッドキーとして利用し、数値エントリー ID や slug が渡された場合でもバックエンドが自動的に Document ID へ補正して処理します。
7. フロントエンドのコメント UI は Strapi から取得したスレッドを `PUBLIC_COMMENTS_PAGE_SIZE` 件ずつページングし、長い議論でも UI がだらだら伸びないようにページナビゲーションを自動で差し込みます。ニックネーム欄は空欄でも投稿でき、その場合は記事に設定したデフォルト名（未設定時は `PUBLIC_COMMENTS_DEFAULT_AUTHOR` の値）が自動で表示に使われます。投稿者情報はブラウザのローカルストレージに暗号化せず保存するため、共有端末では送信後に「ニックネーム」「メールアドレス」を手動でクリアしてください。
8. 返信コメントが付くと、元コメントの著者メールアドレス宛に Strapi のメールプラグインから通知が送信されます。VirtusLab Comments 3.1.0 では投稿時にメールアドレスが必須のため、フロントエンド側で空欄／不正値を検知した場合は `@comments.local` ドメインのダミーアドレスを生成して API へ送信し、リクエスト段階で 400 を回避します。バックエンドも同じドメインを使って不足分を再検証し、ダミー宛には通知を送らないようスキップしています。実際に返信通知を受けたい場合は有効なメールアドレスを入力し、SMTP（`SMTP_*`）と `COMMENTS_CONTACT_EMAIL` を設定してからテスト送信で動作確認してください。
9. Post コンテンツタイプには「コメント用デフォルト名」と「本文フォントサイズ」フィールドを追加しています。前者は記事ごとに匿名投稿者へ表示したい名前を設定でき、未入力時は `PUBLIC_COMMENTS_DEFAULT_AUTHOR` が利用されます。後者は本文全体のフォント倍率（標準/やや大きい/大きい）を CMS から選択でき、視認性を記事単位で整えられます。
10. Strapi 管理画面でコメント一覧を開いた際に `A valid integer must be provided to limit` が繰り返し表示される場合は、`cms/src/extensions/comments/strapi-server.js` に追加したリミット正規化ロジックが動作しているか確認してください。クエリ文字列の `limit` / `pagination[pageSize]` が数値以外になった場合でも自動的に 50 件（最大 200 件まで）へ丸め込み、Knex の警告でリロードループに陥らないようになりました。フロントエンド側も `web/src/lib/comments.ts` でページサイズを 1〜200 件にクランプするため、必要に応じて双方の上限を同時に調整してください。
##### トラブルシューティング

- **コメントが取得できない / 「Forbidden」と表示される**：`Public` 役割に `Comments: Read` / `Comments: Create` / `Comments: Report abuse` が付与されているか確認します。bootstrap が自動同期しますが、権限を削除した場合は `npm run develop` で Strapi を再起動して反映させてください。
- **メール通知が届かない**：`COMMENTS_CONTACT_EMAIL` と `SMTP_*` の設定を見直し、Strapi の `Settings → Email` でテスト送信してください。
- **CORS/CSRF エラー**：フロントエンドから `STRAPI_API_URL` へアクセスできるか、CORS 設定と Cloudflare/Caddy のリバースプロキシ設定を確認します。

#### ヘッダービディング / リアルタイム入札設定

1. Google Ad Manager（旧 DFP）で広告ユニットを作成し、ネットワークコード（例: `1234567`）と広告ユニットのパス（例: `/1234567/game-news/in-article`）を控えます。
   - 同一プレフィックスを複数枠で共有する場合は `/1234567/game-news` を `PUBLIC_ADS_GPT_AD_UNIT_PREFIX` に設定し、各枠の `code` を `in-article` / `feed` / `related` のように分けます。
2. `.env` にて `PUBLIC_ADS_HEADER_BIDDING_ENABLED=true` とし、`PUBLIC_ADS_GPT_NETWORK_CODE` および `PUBLIC_ADS_GPT_AD_UNIT_PREFIX` を上記の値に置き換えます。
3. `PUBLIC_ADS_HEADER_BIDDING_UNITS` に Prebid.js の adUnits 配列を JSON 形式で記述します。
   - `code` がフロントの `InlineAd` コンポーネントに渡す `placement` と一致するようにしてください。
   - `mediaTypes.banner.sizes` は提供可能なサイズ一覧、`bids` は SSP ごとの `bidder` 名とパラメータ（例: `placementId` や `accountId/siteId/zoneId`）を指定します。
   - 具体的な JSON 例は `web/.env.sample` を参照してください。複数行に分ける場合はバックスラッシュを使わず、1 行の JSON として記述します。
4. Cloudflare Pages など静的ホスティングでも Prebid.js/CDN が自動で読み込まれ、入札完了後に Google Ad Manager へターゲティングを反映します。入札に失敗した場合は従来どおり AdSense が表示されます。
5. デバッグ時はブラウザのコンソールで `pbjs.getBidResponses()` や `googletag.pubads().getSlots()` を確認し、ターゲティングキーが設定されているかをチェックしてください。

> **Note**: `.env.sample` をコピーした直後に `STRAPI_API_URL`/`STRAPI_MEDIA_URL` を未設定（空欄）のまま起動すると、自動的に `http://localhost:1337` を参照します。`example.com` や `namespace/b/bucket` などのプレースホルダードメインが残っている場合も同様にローカル URL へフォールバックするため、実環境では必ず公開 URL に置き換えてください。

#### 記事本文に広告を差し込む（Inline Ad Slot ブロック）

- Strapi の Post エディタには Dynamic Zone 用に **Inline Ad Slot** ブロックを追加済みです。本文ブロックの間に挿入すると、Astro 側で `InlineAdBlock` コンポーネントが広告ラベル付きカードとして描画されます。
- フィールド構成
  - `slot`: AdSense のユニット ID。ヘッダービディング併用時も必須で、空欄の場合は広告コードを描画しません。
  - `placement`: Prebid.js / Google Ad Manager のプレースメントコード。`.env` の `PUBLIC_ADS_HEADER_BIDDING_UNITS` 内の `code` と一致させます。
  - `label`: 「スポンサーリンク」などの表示名。省略時は自動で既定ラベルが付きます。
  - `note`: 運用メモ用フィールドで、管理画面のみ表示されます。
- ブロックを複数配置すると、その順番に沿って本文内へ広告が挿入されます。関連記事の 3:1 混在ロジックとは独立して動作するため、記事内の任意位置へ柔軟に配置可能です。
- `slot` と `placement` をあらかじめテンプレート化しておくと、編集者はプルダウン感覚で広告枠を挿入できます。`.env` で AdSense / ヘッダービディングを未設定の場合はラベルのみ表示されるため、公開前にプレビューで挿入位置を確認してください。

#### 広告収益最大化のための運用ヒント

- **複数の SSP / Bidder を組み合わせる**: `PUBLIC_ADS_HEADER_BIDDING_UNITS` には 3 社以上の SSP を登録し、インプレッション数が伸びている枠から順に効果検証を行います。応札が弱い SSP は `bids` から外すか `labelAny` でデバイスを限定すると単価が安定します。
- **フロア価格の調整**: Google Ad Manager 側で `Price Priority` ラインアイテムを作り、季節性やイベントに応じてフロア価格を調整してください。Prebid.js が返す `hb_pb` をキーにすると、より細かい単価制御が可能です。
- **ビューワビリティの改善**: `.ad-panel` の周辺に 200〜300px 程度の余白を持たせると視認性が向上します。レイアウト崩れを防ぐため、CSS の `min-height` や `aspect-ratio` を活用して CLS を抑制してください。
- **効果測定の自動化**: Google Analytics 4 と BigQuery を連携させ、`page_view` と `adsbygoogle` / Prebid イベントを統合的に分析します。曜日・時間帯ごとの RPM（Revenue per Mille）を可視化すると改善余地が見つけやすくなります。
- **将来拡張**: AMP 配信や Instant Articles を追加チャネルとして検討することで、ヘッダービディングと併用した在庫最適化が可能になります。モバイル流入が多い場合は優先度高です。


### GitHub Actions Secrets（Cloudflare Pages デプロイ）
Cloudflare Pages へ自動デプロイするため、GitHub リポジトリの **Settings → Secrets and variables → Actions** に以下を設定します。

| 名前 | 説明 | 例 |
| --- | --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare アカウント ID。ダッシュボード右下や API Tokens 画面で確認できます。 | `1234567890abcdef1234567890abcdef` |
| `CLOUDFLARE_PAGES_PROJECT` | Cloudflare Pages のプロジェクト名。Direct Upload プロジェクト作成時に決めた名称。 | `game-news-web` |
| `CLOUDFLARE_API_TOKEN` | Pages デプロイ権限を持つ API トークン。テンプレート `Cloudflare Pages - Create Deployments` を利用して発行します。 | `cf-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `CLOUDFLARE_PAGES_BRANCH` | （任意）常にデプロイ対象とするブランチ。未設定なら `github.ref_name` が使用されます。 | `main` |

### OCI Compute（Always Free）に Strapi を配置する手順
OCI で CMS を常駐させる際は、以下の流れで Compute インスタンスとドメイン周りを整備します。

1. OCI コンソールの **Compute → Instances** で `Create Instance` をクリックし、`Always Free Eligible` の `VM.Standard.A1.Flex`（ARM）または `VM.Standard.E2.1.Micro`（x86）を選びます。
2. OS イメージは `Oracle Linux 9` か `Ubuntu Server 22.04` を推奨します。**SSH 公開鍵**を登録し、後でインスタンスに接続できるようローカルの秘密鍵を保管してください。
3. 作成後、`VCN`（仮想クラウドネットワーク）のセキュリティリストまたはネットワークセキュリティグループ (NSG) に以下の受信ルールを追加します。
   - TCP 80 (HTTP)
   - TCP 443 (HTTPS)
   - TCP 1337 (Strapi 管理画面にローカルからアクセスする場合のみ)
4. SSH でインスタンスに接続します。
   ```bash
   ssh -i ~/.ssh/oci-key opc@<public-ip>
   ```
5. Node.js と Docker Compose を利用する場合は以下のセットアップを実行します。
   ```bash
   sudo dnf update -y          # Ubuntu の場合は apt update
   curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
   sudo dnf install -y nodejs git docker docker-compose-plugin
   sudo systemctl enable --now docker
   sudo usermod -aG docker opc  # `opc` を docker グループへ
   exit && ssh -i ~/.ssh/oci-key opc@<public-ip>  # 権限更新のため再ログイン
   ```
6. リポジトリをクローンし、Strapi の `.env` を配置します。
   ```bash
   git clone https://github.com/your-account/birdrock926.github.io.git
   cd birdrock926.github.io
   cp cms/.env.sample cms/.env
   # 本番値に書き換えた `.env` を `vim` などで編集
   ```
7. `infrastructure/docker-compose.yml` を使って Strapi を起動します。
   ```bash
   cd infrastructure
   docker compose pull
   docker compose up -d
   ```
8. Caddy をリバースプロキシとして利用する場合は `infrastructure/Caddyfile` を `/etc/caddy/Caddyfile` に配置し、以下で有効化します。
   ```bash
   sudo cp Caddyfile /etc/caddy/Caddyfile
   sudo systemctl enable --now caddy
   ```
   Caddy が Let's Encrypt で自動的に証明書を取得し、Strapi への HTTPS 経由アクセスが可能になります。
9. DNS の A レコードを OCI インスタンスのパブリック IP に向け、ブラウザから `https://cms.example.com/admin` にアクセスして初期ユーザー登録を行います。
10. Strapi の `Settings → Webhooks` で GitHub Actions を呼び出す Webhook を設定し、実際に Publish → Cloudflare Pages まで反映されるか確認してください。

> **Troubleshooting**: OCI インスタンスのファイアウォール (`firewalld`) が有効な場合は `sudo firewall-cmd --add-service=http --add-service=https --permanent && sudo firewall-cmd --reload` で 80/443 を解放してください。

> **セキュリティメモ**: `.env` ファイルは Git にコミットしないよう `.gitignore` 済みです。必要に応じて 1Password や Vault などのシークレットストアで共有し、平文でのやり取りは避けてください。

---

# セットアップ手順

## 1. CMS（Strapi）
```bash
cd cms
cp .env.sample .env
npm install
npm run build
npm run develop
```
Strapi 管理画面初期化後、管理ユーザーを作成し、記事・タグ・メディアなどのコンテンツタイプが表示されることを確認します。コメント関連の設定は Comments プラグイン（VirtusLab）で行えるため、追加の外部サービス構築は不要です。

## 2. フロントエンド（Astro）
```bash
cd web
cp .env.sample .env
npm install
npm run build
npm run preview
```
`npm run dev` / `npm start` は Strapi が応答するまで無制限に待機するようになり、CMS → Web の起動順序を気にせずに立ち上げても記事詳細が確実に取得できます（必要に応じて `STRAPI_WAIT_TIMEOUT_MS` で制限可能）。`npm run preview` でローカル確認後、Cloudflare Pages へデプロイします。

---

# 運用ランブック

## Webhook → Cloudflare Pages 自動デプロイ
1. Strapi で記事を Publish / Unpublish
2. Strapi Webhook が GitHub Actions の `workflow_dispatch` を呼び出し
3. Actions が Astro をビルドし、Cloudflare Pages へデプロイ

## コメントモデレーション

### 管理画面と権限

- Strapi 管理 UI の左メニュー **Plugins → Comments** でコメント一覧、レポート、設定にアクセスできます。`Overview`（全件）/`Pending`（承認待ち）/`Approved`/`Rejected`/`Reported` のタブを使い分けて状況を確認します。
- 匿名投稿を受け付けるには `Settings → Users & Permissions Plugin → Roles → Public` で `plugin::comments.client-comments` の `find` / `findOne` / `create` / `report` にチェックが入っていることを確認します。権限を絞りたい場合は `report` のみ `Authenticated` ロールへ移すなどの運用が可能です。
- `Settings → Configuration → General` では自動モデレーションの閾値（禁止語、最大スレッド深度、レートリミット）やメール通知先を設定できます。`.env` の `COMMENTS_CONTACT_EMAIL` に指定したアドレスへ通報メールが送られます。
- コメントのステータスは一覧の右端メニュー（⋯）から **Change status** を選ぶか、詳細ドロワーの `Status` ドロップダウンで `Approved` / `Pending` / `Rejected` を切り替えられます。公開後に再度 `Pending` へ戻して差し戻すことも可能です。

### 推奨ワークフロー（例）

1. **毎朝** `Pending` を確認し、ポリシーに沿って **Approve** / **Reject** を実施。承認済みコメントは数秒でフロントにも反映されます。
2. **レポートタブ**に新着がある場合は、内容を確認して必要なら **Block user** や **Block thread** を選択し、対応完了後に **Report resolved** を押下します。
3. **週次**で `Overview` をエクスポート（CSV）し、NG ワードのすり抜けやスパム投稿の傾向を分析します。フィードバックを受けて `COMMENTS_BAD_WORDS` や自動モデレーション設定を更新してください。

### ステータスとアクションの対応表

| ステータス / アクション | 説明 | フロントでの表示 |
| --- | --- | --- |
| `Pending` | 承認待ち。コメント本文は非公開で、「承認待ちです」と表示されます。 | コメントカードは表示されるが本文は伏せ字。 |
| `Approved` | 公開済み。必要に応じて再編集（編集履歴付き）や返信が可能。 | 通常表示。 |
| `Rejected` / `Removed` | 管理者が却下・削除。 | 「管理者によって非表示になりました」と表示されます。 |
| `Block user` | 投稿者単位で将来の投稿を拒否。`COMMENTS_BLOCKED_AUTHOR_PROPS` に指定したキー（例: `email`）で判定。 | 既存コメントは残るが新規投稿を拒否。 |
| `Block thread` | 特定スレッドへの新規返信を停止。 | フロントに「返信停止中」とバッジが表示され、返信ボタンが非活性になります。 |

### 通報・監視とバックアップ

- `Reported` タブでは読者の通報を一覧できます。対応後は **Report resolved** を押して履歴を残してください。Slack やメールに転送したい場合は Strapi Webhook を利用すると自動連携できます。
- コメントは Strapi 管理画面の **Comments → All** で確認できます。数値エントリー ID や slug で投稿されていた古いコメントも、起動時の正規化処理によって Document ID に変換されるため、リロードすれば該当記事のスレッドが表示されます。
- フロントエンドの「通報する」フォームから送られた内容は `Reported` タブに即時反映され、`reason` と `content` が管理画面に届きます。`スパム` など独自の理由はバックエンドで `OTHER / BAD_LANGUAGE / DISCRIMINATION` のいずれかに正規化され、元の入力内容はメモとして追記されるため、管理画面で迷子になりません。必要に応じてコメント詳細の `Block user` / `Block thread` / `Delete` アクションを組み合わせて対処してください。
- SMTP を設定しておくと、新着コメントや通報をメールで即時受け取れます。SPF/DKIM を整備し、迷惑メール判定されないようにしてください。
- コメントデータのバックアップは **Content Manager → plugin::comments.comment → Export** で CSV/JSON を取得できます。月次のエクスポートと DB スナップショットを併用すると、誤削除時のリカバリが容易になります。

## セキュリティ
- 管理画面は OAuth / SSO 連携や IP 制限の併用を推奨
- `.env` や API トークンは OCI Secrets Vault または GitHub Secrets 等の安全なストアで管理
- CSP / Referrer-Policy / X-Content-Type-Options / 最小 CORS / CSRF 対策は既定設定済み

---

# テスト

## ユニット
- `npm run test`（cms）で追加したユニットテストを実行できます。
- フロントエンドは必要に応じて `npm run lint` / `npm run build` で静的検証を行ってください。

## E2E
- `/infrastructure/tests/e2e` に Playwright シナリオの雛形を用意
- 記事公開→Cloudflare Pages 反映、および Comments API への投稿→承認フローを自動化するテストを追加できます

## アクセシビリティ
- `npm run test:a11y`（web）で `@axe-core/cli` を用いた基本チェックを実施

---

# 主要コマンド

- CMS ビルド：`cd cms && npm run build`
- CMS 起動（開発）：`cd cms && npm run develop`
- WEB ビルド：`cd web && npm run build`
- WEB プレビュー：`cd web && npm run preview`
- ルート Lint：`npm run lint`（ワークスペース共通 ESLint）

---

# デプロイ手順（本番）

1. OCI インスタンスに `/cms` をデプロイし、`docker-compose -f infrastructure/docker-compose.yml up -d` を実行
2. GitHub Actions が成功し、Cloudflare Pages の最新ビルドが `Production` ステータスになることを確認
3. 独自ドメインを利用する場合は次節の手順で DNS / CNAME を設定
4. Strapi Webhook の Secrets を登録し、Publish → Cloudflare Pages 更新が自動化されることを確認

## Cloudflare Pages の独自ドメイン設定

Cloudflare Pages ではプロジェクト設定から独自ドメインを追加し、DNS に `project.pages.dev` への CNAME（または APEX 用の CNAME 記法）を登録します。以下はサブドメイン（例: `news.example.com`）を設定するケースです。

1. Cloudflare ダッシュボードの **Workers & Pages → Pages** で対象プロジェクトを開き、**Custom domains → Set up a custom domain** を押します。
2. `news.example.com` を入力し、同じアカウントでドメインを管理している場合は **Automatic (CNAME)** を選択して自動追加します。外部 DNS を利用している場合は、表示される `CNAME` レコード（値は `your-project.pages.dev`）を DNS サービスに登録してください。
3. ルートドメインを割り当てたい場合は Cloudflare の **Flattening**（CNAME の APEX 解決）を有効にするか、外部 DNS の ALIAS / ANAME 機能を利用します。
4. DNS 伝播後、Cloudflare Pages のダッシュボードで `Active` 表示になることを確認し、ブラウザで `https://news.example.com` にアクセスして Cloudflare の証明書が配信されているかチェックします。
5. Astro 側の `.env` で `SITE_URL=https://news.example.com`、`PUBLIC_TWITCH_PARENT_HOSTS` に `news.example.com` を追加して再ビルドします。必要に応じて `robots.txt` や OGP 設定も更新してください。

> **Tip**: Cloudflare DNS を利用している場合は SSL/TLS を `Full (Strict)`、エッジキャッシュ TTL を適切に設定し、`Always Use HTTPS` を有効化すると運用が簡潔になります。外部 DNS を使う場合も、Cloudflare Pages ダッシュボードでステータスが `Active` になっていることを必ず確認してください。


---

# トラブルシューティング

- **Strapi が起動しない**：`npm run build -- --clean` を実行し、`node_modules` を削除後再インストール
- **Webhook が失敗する**：Strapi ログと GitHub Actions の `workflow_dispatch` イベントログを確認
- **コメントが投稿できない／フォームが表示されない**：Strapi の `Public` 役割に `Comments: Read` / `Comments: Create` が付与されているか、`STRAPI_API_URL` がフロントの `.env` に設定されているかを確認してください。ブラウザの開発者ツールで `/api/comments/...` へのリクエストが 401 / 403 になっていないか、CORS ヘッダーが正しく返っているかを併せて確認します。
- **Comments タブに投稿が表示されない**：Strapi を再起動すると bootstrap が `api::post.post:<entryId>` 形式の `related` へ自動正規化します。ログに `Normalized ... comment relations` が出力されるまで待機し、管理画面をリロードしてください。
- **Comments → View で「A valid integer must be provided to limit」が連続表示される**：`cms/src/extensions/comments/strapi-server.js` のリミットサニタイズが空クエリでも 50 件に固定し、`limit`/`pagination[pageSize]` など全てのエイリアスを書き換えるようになりました。再起動してもエラーが続く場合はブラウザのキャッシュを消した上で管理画面をリロードしてください。
- **Strapi ビルド時の `Bus error` (SIGBUS)**：Node 20 + Alpine でも動作するよう CLI をパッチ済みですが、メモリ 2GB 未満の環境では Vite が落ちる可能性があります。`npm run build` 実行前にメモリ割り当てを増やすか、公式 `strapi/strapi:5`（Node 18 ベース）でビルドする方法、またはローカルでビルド済み成果物をマウントする方法に切り替えてください。
- **`ERR_UNSUPPORTED_DIR_IMPORT: lodash/fp`**：本リポジトリでは `patch-package` と `scripts/run-strapi.mjs` により解消済みです。もし再発した場合は `npm install` でパッチが適用されているか確認し、独自に Strapi をアップグレードした際は `NODE_OPTIONS=--experimental-specifier-resolution=node npm run develop` を一時的に指定するか、Docker/Node 18 での実行を検討してください。
- **Marketplace を開くと `Failed to fetch dynamically imported module` が表示される**：非ローカルホストの URL で `npm run develop` を起動した場合、`scripts/run-strapi.mjs` が自動的に `--no-watch-admin` を付与し、事前に管理画面をビルドしてから開発サーバーを立ち上げます。ログに `Strapi admin prebuild not found. Running "strapi build" ...` が表示されるまで待ち、完了後にブラウザをリロードしてください。ビルドが失敗した場合はログのエラーメッセージを確認して依存パッケージや権限設定を修正します。
- **npm error ENOENT: Cannot cd into ... typescript**：`/cms/package.json` の `devDependencies` に `"typescript": "5.4.5"` を追加し、`rm -rf node_modules package-lock.json && npm install` を実行してください。本リポジトリには修正済みの定義が含まれています。

---

# ライセンス

MIT

---

# 主要ディレクトリツリー

```
.
├─ cms
├─ web
├─ infrastructure
└─ public
```

---

# 動作確認コマンド一覧

| 対象 | コマンド |
| --- | --- |
| CMS ビルド | `cd cms && npm install && npm run build` |
| CMS 開発 | `cd cms && npm run develop` |
| WEB ビルド | `cd web && npm install && npm run build` |
| WEB プレビュー | `cd web && npm run preview` |
| Docker Compose | `docker compose -f infrastructure/docker-compose.yml up -d` |

