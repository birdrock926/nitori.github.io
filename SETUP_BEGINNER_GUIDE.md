# はじめてでも迷わないセットアップ完全ガイド

このドキュメントは、初めて Node.js や Strapi、Astro を触る方でも環境構築からローカル確認、本番公開の流れまで一通り体験できるように丁寧に説明しています。作業に不慣れな場合は、上から順番に読みながら手を動かしてみてください。

## 0. 全体像をつかむ
- **CMS (/cms)**: Strapi v5 で記事やコメントを管理する管理画面と API。
- **Web (/web)**: Astro + React Islands で構成された静的サイト。Strapi から公開記事を取得してビルドし、GitHub Pages に配置します。
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
2. シークレット値を生成
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
   出力された値を `APP_KEYS`（4 個分をカンマで連結）、`API_TOKEN_SALT`、`ADMIN_JWT_SECRET`、`JWT_SECRET`、`HASH_PEPPER`、`ALIAS_SALT` に貼り付けます。
3. 主要項目のチェック

   | カテゴリ | 変数 | 内容 | 推奨値・例 |
   | --- | --- | --- | --- |
   | 基本 | `PUBLIC_URL` | CMS を公開する URL | `https://cms.example.com` |
   |  | `PUBLIC_FRONT_ORIGINS` | フロントから API を呼べるオリジン | `https://example.github.io` |
   | CAPTCHA | `CAPTCHA_PROVIDER` | `turnstile` または `recaptcha` | `turnstile` |
   |  | `CAPTCHA_SECRET` | プロバイダー発行のシークレットキー | Turnstile の場合: `1x0000000000000000000000000000000AA` |
   | レート制限 | `RATE_LIMITS_MIN/HOUR/DAY` | コメント投稿の制限回数 | `5 / 30 / 200` |
   | Webhook | `GITHUB_WORKFLOW_OWNER/REPO/ID/TOKEN/BRANCH` | Strapi Publish → GitHub Actions の連携設定 | `owner=your-org` など |
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
   | `SITE_URL` | 公開サイトの URL（Pages or 独自ドメイン） | `https://example.github.io` |
   | `DELETE_REQUEST_FORM_URL` | 記事削除依頼フォームへのリンク | Google フォームの「回答を収集」URL |
   | `GA_MEASUREMENT_ID` | GA4 の測定 ID。不要なら空欄 | `G-XXXXXXXXXX` |
   | `ADSENSE_CLIENT_ID` / `ADSENSE_SLOT_*` | AdSense のクライアント / 広告ユニット ID | `ca-pub-...` |
   | `CONSENT_DEFAULT_REGION` | 同意モードの初期判定地域 | `JP` |
   | `PUBLIC_TWITCH_PARENT_HOSTS` | Twitch 埋め込みの parent 候補（カンマ区切り） | `example.github.io,www.example.com` |

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

## 7. Docker Compose で本番想定の CMS を立ち上げる (任意)
OCI Always Free と同等の構成をローカルで試す場合は、`infrastructure/docker-compose.yml` を利用します。

```bash
cd infrastructure
cp ../cms/.env .env
# 本番用の値に書き換える

# 初回のみビルド (Strapi イメージを取得)
docker compose pull

# 起動
docker compose up -d

# ログ確認
docker compose logs -f strapi
```

停止する際は `docker compose down` を実行します。

## 8. GitHub Pages へのデプロイ (概要)
1. GitHub リポジトリの Settings → Pages で `GitHub Actions` を選択します。
2. `.github/workflows/deploy-web.yml` が push / workflow_dispatch / schedule トリガで Astro をビルドし、Pages へデプロイします。
3. Strapi の Webhook から GitHub Actions を呼び出す場合は、`cms/.env` に以下を設定します。
   - `GITHUB_WORKFLOW_OWNER`
   - `GITHUB_WORKFLOW_REPO`
   - `GITHUB_WORKFLOW_ID`
   - `GITHUB_WORKFLOW_TOKEN`

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
