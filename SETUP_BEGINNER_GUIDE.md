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
   | CAPTCHA | `CAPTCHA_PROVIDER` | `turnstile` または `recaptcha` | `turnstile` |
   |  | `CAPTCHA_SECRET` | プロバイダー発行のシークレットキー | Turnstile の場合: `1x0000000000000000000000000000000AA` |
   | レート制限 | `RATE_LIMITS_MIN/HOUR/DAY` | コメント投稿の制限回数 | `5 / 30 / 200` |
   | Webhook | `GITHUB_WORKFLOW_OWNER/REPO/ID/TOKEN/BRANCH` | Strapi Publish → Cloudflare Pages 用 GitHub Actions の連携設定 | `owner=your-org` など |
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

3. `STRAPI_API_TOKEN` は Strapi 管理画面の「設定 > API トークン」で `Read-only` トークンを作成して貼り付けます。
4. 編集後は `cd ..` でルートに戻ります。

> `.env` はチーム共有時に漏洩しないよう、1Password・Vault 等のシークレットマネージャーで管理しましょう。メールやチャットに平文で貼り付けるのは避けてください。

## 4. 依存パッケージをインストールする
プロジェクト直下で以下のコマンドを実行すると、CMS と Web の依存が順番にインストールできます。初回は数分かかることがあります。

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

いずれのコマンドもエラーが表示されなければ成功です。

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
