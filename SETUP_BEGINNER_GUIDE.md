# はじめてでも迷わないセットアップ完全ガイド

このドキュメントは、初めて Node.js や Strapi、Astro を触る方でも環境構築からローカル確認、本番公開の流れまで一通り体験できるように丁寧に説明しています。作業に不慣れな場合は、上から順番に読みながら手を動かしてみてください。

## 0. 全体像をつかむ
- **CMS (/cms)**: Strapi v5 で記事やコメントを管理する管理画面と API。
- **Web (/web)**: Astro + React Islands で構成された静的サイト。Strapi から公開記事を取得してビルドし、Cloudflare Pages に配置します。
- **Infrastructure (/infrastructure)**: OCI Always Free 上で CMS を常駐させる Docker Compose と Caddy の設定例。

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
   | 基本 | `PUBLIC_URL` | CMS を公開する URL | `https://cms.example.com` |
   |  | `PUBLIC_FRONT_ORIGINS` | フロントから API を呼べるオリジン | `https://example.pages.dev` |
   | CAPTCHA | `CAPTCHA_PROVIDER` | `none` / `turnstile` / `recaptcha` | 開発は `none` |
   |  | `CAPTCHA_SECRET` | プロバイダー発行のシークレットキー | Turnstile の例: `1x0000000000000000000000000000000AA` |
   | レート制限 | `RATE_LIMITS_MIN/HOUR/DAY` | コメント投稿の制限回数 | `5 / 30 / 200` |
   | コメント即時公開 | `COMMENTS_AUTO_PUBLISH` | `true` にすると投稿直後から公開。開発は `true`、本番は `false` 推奨。 | `false` |
   | Webhook | `GITHUB_WORKFLOW_OWNER/REPO/ID/TOKEN/BRANCH` | Strapi Publish → Cloudflare Pages 用 GitHub Actions の連携設定 | `owner=your-org` など |
   > `.env` をプレースホルダーのままにすると、Strapi が GitHub Actions 連携を自動的にスキップし、開発環境で 401 エラーが発生しません。実際に連携させたいタイミングで GitHub Secrets を発行し、`local-owner` や `github-token-placeholder` を本番値に差し替えましょう。ログに `[github] Webhook dispatch skipped` が出ていればスキップされています。

   > **コメント送信者の IP について**: 投稿時の IP と UA は `meta.client.ip` / `meta.client.ua` に平文で格納されます。公開 API には含まれず、管理画面の **JSON を表示** か管理者 API (`GET /api/mod/comments/:id/meta`) からのみ確認できます。
   | DB | `DATABASE_CLIENT` | `sqlite`・`postgres` など | 初期は `sqlite` |
   | アップロード | `UPLOAD_PROVIDER` | `local` or `oci` | 帯域節約には `oci` |
   |  | `OCI_*` 一式 | Object Storage のバケット・キー情報 | OCI コンソールで発行した値 |
   | メール | `SMTP_*` | 通知メール設定 | Gmail や SendGrid 等 |

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
   | `STRAPI_API_URL` | CMS API のベース URL | `https://cms.example.com` |
   | `STRAPI_API_TOKEN` | Strapi で発行した Read-only API トークン | `strapi_pat_xxx` |
   | `STRAPI_MEDIA_URL` | 画像のホスト URL（OCI の公開パス） | `https://objectstorage.ap-tokyo-1.oraclecloud.com/.../o` |
   | `SITE_URL` | 公開サイトの URL（Pages or 独自ドメイン） | `https://example.pages.dev` |
   | `DELETE_REQUEST_FORM_URL` | 記事削除依頼フォームへのリンク | Google フォームの「回答を収集」URL |
   | `GA_MEASUREMENT_ID` | GA4 の測定 ID。不要なら空欄 | `G-XXXXXXXXXX` |
   | `ADSENSE_CLIENT_ID` / `ADSENSE_SLOT_*` | AdSense のクライアント / 広告ユニット ID | `ca-pub-...` |
   | `CONSENT_DEFAULT_REGION` | 同意モードの初期判定地域 | `JP` |
   | `PUBLIC_TWITCH_PARENT_HOSTS` | Twitch 埋め込みの parent 候補（カンマ区切り） | `example.pages.dev,www.example.com` |
   | `PUBLIC_CAPTCHA_PROVIDER` | コメントフォーム用 CAPTCHA の種別 (`none` / `turnstile` / `recaptcha`) | `none` |
   | `PUBLIC_TURNSTILE_SITE_KEY` / `PUBLIC_RECAPTCHA_SITE_KEY` | 各プロバイダーのサイトキー | `0x00000000000000000000FFFF` |

3. `STRAPI_API_TOKEN` は Strapi 管理画面の「設定 > API トークン」で `Read-only` トークンを作成して貼り付けます。
4. 編集後は `cd ..` でルートに戻ります。

#### CAPTCHA の設定手順

- 開発中は `CAPTCHA_PROVIDER=none`（CMS）と `PUBLIC_CAPTCHA_PROVIDER=none`（Web）のまま動作確認できます。
- 本番で CAPTCHA を有効化する場合は、Cloudflare Turnstile か Google reCAPTCHA v3 のどちらかを選び、以下の手順でキーを取得します。

**Cloudflare Turnstile**

1. Cloudflare ダッシュボードで **Turnstile → Add Site** を開き、検証方式を `Managed`、ドメインに公開サイトのホスト名（複数可）を入力して作成します。
2. 表示された **Site Key** と **Secret Key** を控え、`cms/.env` に `CAPTCHA_PROVIDER=turnstile`, `CAPTCHA_SECRET=<Secret Key>`、`web/.env` に `PUBLIC_CAPTCHA_PROVIDER=turnstile`, `PUBLIC_TURNSTILE_SITE_KEY=<Site Key>` を設定します。
3. 設定を保存したら CMS/Web 双方で `npm run build` を再実行し、コメントフォームに Turnstile ウィジェットが表示されることを確認します。

**Google reCAPTCHA v3**

1. [reCAPTCHA 管理画面](https://www.google.com/recaptcha/admin) にアクセスし、タイプ `reCAPTCHA v3` で新しいサイトを登録します。
2. 取得したサイトキー・シークレットキーを `cms/.env`（`CAPTCHA_PROVIDER=recaptcha`, `CAPTCHA_SECRET=<...>`）と `web/.env`（`PUBLIC_CAPTCHA_PROVIDER=recaptcha`, `PUBLIC_RECAPTCHA_SITE_KEY=<...>`）に設定します。
3. Astro 側は送信時に自動で `grecaptcha.execute()` を呼び出すため、追加のフォーム改修は不要です。

> **メモ**: CAPTCHA を有効にした状態でテスト投稿を行う場合は、シークレットキーが正しいか・Cloudflare/Google 側でドメインが許可されているかを確認してください。無効化する場合は再び `none` に戻すだけで OK です。

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

- ブラウザで `http://localhost:4321` を開き、トップページ・記事ページ・タグページが表示されることを確認します。
- 匿名コメント島は Strapi の `/api/comments/list` へアクセスできると動作します。

サーバーを停止する場合は、ターミナルで `Ctrl + C` を押します。

### 6-3. ブロックエディタで装飾する
- Strapi の記事フォームでは **Dynamic Zone** を利用しており、`Rich Text` のほかに以下のブロックが追加済みです。
  - **Colored Text**：公式 Color Picker プラグインのカラーフィールドで文字色／背景色を決定し、ラベルをワンポイントで強調できます。
    - `isInline` をオンにすると段落内の短いハイライトとして扱えます。
  - **Callout**：トーン（Info / Success / Warning / Danger）と任意のアイコン文字列を設定し、注意喚起ボックスを作成します。
  - **Columns**：2〜3 カラムのレイアウトを組めるブロックです。各カラムに見出し＋本文（Rich Text コンポーネント）を配置できます。
  - **Separator**：セクションの区切り線や「続きはこちら」といったラベルを表示します。
- 画像やギャラリー、YouTube / Twitch 埋め込みブロックもこれまで通り利用できます。プレビューで並び順・余白が崩れていないか確認しましょう。
- 記事の **Slug（URL）** フィールドは日本語やハイフン入りの任意文字列をそのまま利用できます。重複する場合は自動的に `-2` などの連番が付きます。
- Rich Text ブロックは改行や段落をそのまま HTML に変換し、Shift+Enter の改行も `<br>` として表示されます。プレビューで段落が期待通りに分かれているか確認しましょう。
- 文字色や背景色は 16 進カラーコードで保存されるため、Web 側でも同じ色で再現されます。実際の公開ページで読みづらくならないよう、彩度の高い色は Callout や Columns で背景を調整するのがおすすめです。
- 関連記事ウィジェットは「記事 3 件：広告 1 枠」の配列になるよう自動整列します。AdSense の関連コンテンツ枠 ID を `.env` の `ADSENSE_SLOT_RELATED` に設定したうえで、Strapi 側で関連記事を 3 件以上紐付けると自然なカード列になります。
- 記事詳細の右上には「削除依頼」「共有」メニューが表示されます。フォーム URL は `DELETE_REQUEST_FORM_URL` を変更、SNS 共有テキストは記事タイトルとサイト名を自動結合します。公開前にフォームの公開範囲と URL を確認してください。

### 6-4. コメントをモデレーションする
- Strapi のサイドバー「Content Manager → Comments」を開くと、最新投稿が `status` 列付きで表示されます。初期状態は `pending` なので、内容を確認して問題なければ `published` に更新してください。
- 投稿者本人のみに見せたい場合は `shadow`、完全に非表示にしたい場合は `hidden` を選択します。変更すると API レスポンスに即時反映されます。
- 公式アカウントとして返信する際はコメント編集画面で `isModerator` をオンにすると、Web 側でバッジとカラーが付いた「モデレーター」表示になります。必要に応じて `alias` を編集して署名を入れてください。
- 本文が禁止語・未許可ドメイン・リンク過多のインデックスに該当すると自動的に `pending` となり、理由が `meta.moderation.reasons` に記録されます。該当しない投稿は `COMMENTS_AUTO_PUBLISH=true` の環境で即時公開されます。
- コメント詳細画面右上の「︙」→ **JSON を表示** を開くと、`meta.client.ip` と `maskedIp`、`ua`、`submittedAt` をそのまま確認できます。API で確認したい場合は管理者トークンを付与して `GET /api/mod/comments/:id/meta` を呼び出してください。
- API の呼び出し例
  ```bash
  curl -H "Authorization: Bearer <ADMIN_API_TOKEN>" \
    http://localhost:1337/api/mod/comments/123/meta | jq
  ```
- 悪質な送信元を遮断するには「Content Manager → Bans」で `ip_hash`（単一 IP）または `net_hash`（/24）を入力したレコードを追加します。`expiresAt` を設定すると期限付き BAN、空欄なら恒久 BAN です。
- もしくは `POST /api/mod/comments/:id/ban` を呼ぶと、対象コメントの `ip_hash` / `net_hash` を自動取得して BAN を登録し、既定で過去コメントを一括削除します。履歴を残したいときはリクエストボディに `{ "purge": false }` を含めてください。
- フロントエンドでは通報時に「スパム・広告 / 誹謗中傷 / 権利侵害 / その他」から選択できます。同じブラウザからの重複通報は 1 件として扱われます。
- モデレーターが運営判断で通報する場合は `POST /api/mod/comments/:id/report` を呼び出すと `meta.moderation.moderatorFlagged` が有効になり、Web 側で「運営確認中」バッジが表示されます。通報件数は `meta.moderation.reportCount` に反映され、閾値（既定 3 件）を超えると自動で `hidden` に切り替わります。

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
