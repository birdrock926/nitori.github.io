# プロジェクト概要

## 目的（What & Why）
- **ゲームニュース／配信まとめ**を、**高速・低コスト**かつ**運用しやすい GUI**で継続発信し、**検索流入＋SNS拡散でインプレッションを獲得**。  
- **匿名コメント**を安全に受け付け、**通報・モデレーション・BAN**を一元管理。  
- **Google 広告**と **SEO/ニュース露出**を意識した情報設計で、**収益化の地力**を作る。

## 成果物（Deliverables）
- **公開サイト**：Cloudflare Pages で配信される**静的サイト**（Astro + React Islands）
- **管理システム**：OCI 無料枠上の **Strapi v5**（GUI で記事・画像・ブロック・コメントを管理）
- **コメント API**：匿名投稿・返信・通報・BAN・シャドウBAN・レート制限を備えた Strapi 拡張
- **自動公開ライン**：Strapi Publish → Webhook → GitHub Actions → Pages 反映
- **広告/同意**：ads.txt・AdSense タグ／Consent Mode v2 導線（CMP 連携フック）

## ターゲット
- ゲーム情報の**要点だけ素早く**掴みたい読者  
- Twitch/YouTube の**“今すぐ見たい”導線**を求める視聴者  
- 運営側（あなた）：**GUI で書く→プレビュー→公開**までの摩擦を最小化したい

## アーキテクチャ（High Level）
- **フロント（/web）**：Astro SSG  
  - 記事は**Strapi の published のみ**をビルド時取得  
  - **Dynamic Zone**を React コンポーネントにマップ（RichText / ColoredText / Figure / Gallery / Columns / Callout / Separator / Twitch / YouTube）
  - **コメント島**だけクライアントで API に接続（最小 JS）
- **CMS（/cms）**：Strapi v5  
  - 記事・タグ・メディア・埋め込み・**匿名コメント/通報/BAN** を GUI で管理  
  - **Webhook** が GitHub Actions を起動し、Cloudflare Pages へ再デプロイ
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

### 匿名コメント & モデレーション
- **ログイン不要**の投稿/返信（2 階層）  
- **通報→自動非表示**（しきい値）、**シャドウBAN**、**TTL 付き BAN（ip_hash / net_hash）**
- **レート制限**（分/時/日）＋ **CAPTCHA**（Turnstile/Recaptcha 切替）＋ honeypot/Origin 検証
- **サニタイズ**・禁止語・URL 本数制限・リンク**ホワイトリスト**（twitch/youtube/自ドメイン等）
- `/cms/src/modules/comments/*` にモジュール分割した新しいコメントパイプライン（モデレーション/別名生成/レート制限/公開変換）を実装し、管理画面・API・フロントの整合性を強化

### SEO / 収益
- `NewsArticle`/`Article` **JSON-LD**、OGP 自動生成、サイトマップ/RSS  
- **AdSense**：`ads.txt` 雛形・密接配置回避コンポーネント  
- **Consent Mode v2** フック（EEA/UK 対応を将来有効化しやすい構成）

### UI/UX（読者体験）
- テーマ（ライト/ダーク）・読みやすいタイポ・スケルトン/LQIP・アクセシビリティ AA 準拠  
- トップ：ヒーロー＋最新カード＋ライブ配信セクション＋ランキング  
- 記事：目次自動 / 削除依頼ボタン＆シェアメニュー / 関連記事（広告 3:1 混在） / コメント島（控えめ UI）

## データモデル（抜粋）
- **Post**：`title, slug, summary, cover, tags[], blocks(DZ), author, publishedAt`  
- **Comment**：`post, parent, body, alias, status(published|pending|hidden|shadow), ip_hash, edit_key_hash, meta`  
- **Report / Ban**：通報・BAN 管理用  
- **Embed / Media Components**：`RichText, ColoredText, Figure, Gallery, Columns, Callout, Separator, TwitchLive, TwitchVod, YouTube`

## ワークフロー
1. **編集**：Strapi GUI で記事作成 → 画像アップ → ブロック配置 → 下書き保存  
2. **公開**：Publish → Strapi Webhook が **GitHub Actions** をトリガ  
3. **配信**：Astro が API（published のみ）を取得 → Pages へ静的出力  
4. **UGC**：読者が匿名コメント → API 検証 → 掲載 or 保留 → モデで公開/非表示  
5. **保守**：Actions の定期実行（予約公開・ランキング更新）／ログ/アナリティクス確認

## 非機能要件（SLO/品質）
- **パフォーマンス**：トップ LCP < 2.0s、記事 LCP < 2.5s（デスクトップ目安）  
- **可用性**：CMS 落ちても**公開サイトは静的で継続**  
- **スケール**：1 記事 10 万件コメントまで安定ページング  
- **セキュリティ**：CSP/Referrer-Policy/XCTO、最小 CORS、管理画面は OAuth + IP 制限可  
- **ログ/監査**：モデ操作・BAN/通報・失敗レートを構造化ログで保存

## ローンチチェックリスト（抜粋）
- 独自ドメイン/HTTPS、`ads.txt`/AdSense、構造化データ検証、CMP/Consent Mode v2、  
  コメント保護（CAPTCHA/RateLimit/禁止語/URL制限）、Webhook 機密設定、404/500/検索・タグ導線

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

## 事前要件
- Node.js 20 LTS
- npm 10 以上
- Docker / Docker Compose v2（CMS 本番運用時）
- GitHub Actions を利用可能な GitHub リポジトリ
- Cloudflare Turnstile または Google reCAPTCHA v3 のシークレットキー

## ディレクトリ構成
- `/cms` — Strapi v5 プロジェクト（匿名コメント API 拡張含む）
- `/web` — Astro SSG + React Islands
- `/infrastructure` — Docker Compose, systemd, Caddy 設定など
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
> **Memo**: `.env` を作成していなくても `npm run develop` を実行すると、`scripts/ensure-env.mjs` が開発用のダミー値を自動生成して `.env` に書き出します。生成値はローカル動作確認専用なので、本番環境にデプロイする前に必ず置き換えてください。開発用に生成される `COMMENTS_AUTO_PUBLISH` は既定で `smart`（健全な投稿は即時公開、フラグ該当のみ保留）となるため、すべてを事前審査したい場合のみ手動で `manual` に変更します。
2. `node` コマンドで乱数を生成し、シークレットに設定します。
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
   出力された 96 桁の 16 進文字列を `APP_KEYS`（4 個ぶんをカンマ区切り）、`API_TOKEN_SALT`、`ADMIN_JWT_SECRET`、`JWT_SECRET`、`HASH_PEPPER`、`ALIAS_SALT` に割り当ててください。
3. 代表的なキーの説明:

   | 変数名 | 説明 | 例 |
   | --- | --- | --- |
   | `PUBLIC_URL` | CMS を公開する URL。HTTPS で運用します。 | `https://cms.example.com` |
   | `PUBLIC_FRONT_ORIGINS` | フロントエンドから API を呼ぶ許可ドメイン。カンマ区切り。 | `https://example.pages.dev,https://preview.example.com` |
  | `CAPTCHA_PROVIDER` / `CAPTCHA_SECRET` | `none`（開発用）/`turnstile`/`recaptcha` とシークレットキー。`none` の場合は検証をスキップします。 | `none` / `set-before-production` |
  | `RATE_LIMITS_MIN/HOUR/DAY` | 同一送信元のコメント投稿制限回数。ワークロードに合わせて調整。 | `5 / 30 / 200` |
  | `COMMENTS_AUTO_PUBLISH` | `smart`（既定）で健全な投稿のみ即時公開、`manual` ですべて承認待ち、`always` ですべて即時公開。 | `smart` |
  | `DATABASE_CLIENT` | `sqlite`（デフォルト）または `postgres` 等。 | `sqlite` |
   | `UPLOAD_PROVIDER` | `local` or `oci`。OCI Object Storage を使う場合は以下の OCI_* を設定。 | `oci` |
   | `OCI_*` 一式 | OCI Object Storage のバケット情報・認証キー。 | 公式ドキュメント参照 |
   | `SMTP_*` 一式 | Strapi から通知メールを送る際の SMTP 情報。 | `smtp.gmail.com` / `587` |
  | `GITHUB_WORKFLOW_*` | Strapi Webhook で Cloudflare Pages 用の GitHub Actions を呼び出すための設定。 | `OWNER=your-account` 等 |

> **開発時の GitHub Webhook**: `.env` が同梱プレースホルダー（`local-owner` / `local-repo` / `dispatch-workflow.yml` / `github-token-placeholder` など）のままの場合、Strapi は GitHub Actions 連携を自動的にスキップし、開発時の 401 エラーを防ぎます。実運用では GitHub Secrets を発行し、これらを本番値に置き換えてください。スキップ時はログに `[github] Webhook dispatch skipped` が出力されます。

> **IP 取扱いメモ**: コメント送信時のクライアント情報は `meta.client` に平文で保存されます（例: `ip`, `maskedIp`, `ua`, `submittedAt`）。公開 API ではこの情報は返却されず、Strapi 管理画面またはモデレーター向け API (`GET /api/mod/comments/:id/meta`) からのみ確認できます。

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
   | `PUBLIC_CAPTCHA_PROVIDER` | コメント投稿フォームで利用する CAPTCHA。`none` / `turnstile` / `recaptcha` を指定。 | `none` |
   | `PUBLIC_TURNSTILE_SITE_KEY` / `PUBLIC_RECAPTCHA_SITE_KEY` | 各 CAPTCHA プロバイダのサイトキー。未使用のプロバイダは空欄で可。 | `0x00000000000000000000FFFF` |
   | `GA_MEASUREMENT_ID` | Google Analytics 4 の測定 ID（利用しない場合は空欄可）。 | `G-XXXXXXXXXX` |
   | `ADSENSE_CLIENT_ID`, `ADSENSE_SLOT_*` | Google AdSense のクライアント ID と広告ユニット ID。未導入の場合は空欄で OK。 | `ca-pub-...` |
   | `CONSENT_DEFAULT_REGION` | 同意ステータスの初期値を決める地域コード。 | `JP` |

3. `STRAPI_API_TOKEN` は Strapi 管理画面の「設定 > API トークン」から `Read-only` で発行し、ヘッダー `Authorization: Bearer <token>` で利用できるものを貼り付けます。
4. `.env` 保存後は `cd ..` でルートに戻ります。

> **Note**: `.env.sample` をコピーした直後に `STRAPI_API_URL`/`STRAPI_MEDIA_URL` を未設定（空欄）のまま起動すると、自動的に `http://localhost:1337` を参照します。`example.com` や `namespace/b/bucket` などのプレースホルダードメインが残っている場合も同様にローカル URL へフォールバックするため、実環境では必ず公開 URL に置き換えてください。

#### CAPTCHA プロバイダの設定

- **ローカル開発**では `CAPTCHA_PROVIDER=none`（`cms/.env`）と `PUBLIC_CAPTCHA_PROVIDER=none`（`web/.env`）のままで問題ありません。コメント API は CAPTCHA をスキップし、即時動作を確認できます。
- **本番運用**で Cloudflare Turnstile や Google reCAPTCHA v3 を有効化する場合は、以下の手順でサイトキーとシークレットを取得し、`cms/.env` と `web/.env` の両方に設定します。

**Cloudflare Turnstile（推奨）**

1. Cloudflare ダッシュボードで **Turnstile → Add Site** を選択し、サイト名と検証方式に `Managed` を指定します。
2. `Domain` にフロントエンドの公開ドメイン（例: `example.pages.dev`, `www.example.com`）をカンマ区切りで入力し、`Create` をクリックします。
3. 画面に表示される **Site Key** と **Secret Key** を控えます。
4. `cms/.env` に `CAPTCHA_PROVIDER=turnstile`, `CAPTCHA_SECRET=<Secret Key>` を設定し、`web/.env` に `PUBLIC_CAPTCHA_PROVIDER=turnstile`, `PUBLIC_TURNSTILE_SITE_KEY=<Site Key>` を設定します。
5. 設定後に `npm run build`（web/cms）とデプロイを再実行すると、コメントフォームに Turnstile ウィジェットが表示されます。

**Google reCAPTCHA v3**

1. [Google reCAPTCHA 管理コンソール](https://www.google.com/recaptcha/admin) で新しい v3 サイトを登録します。ドメインには公開サイトのホスト名を入力します。
2. 発行された **サイトキー** と **シークレットキー** を控え、`cms/.env` に `CAPTCHA_PROVIDER=recaptcha`, `CAPTCHA_SECRET=<シークレットキー>` を設定します。
3. `web/.env` では `PUBLIC_CAPTCHA_PROVIDER=recaptcha`, `PUBLIC_RECAPTCHA_SITE_KEY=<サイトキー>` を設定してください。
4. フロントエンドは送信時に自動で `grecaptcha.execute()` を呼び出し、サーバー側で検証が行われます。

> **Tips**
> - CAPTCHA を本番で有効化する場合でも既定の `COMMENTS_AUTO_PUBLISH=smart` で健全な投稿は自動公開されます。全件を手動審査したいときだけ `manual` に変更し、常時即時公開したい場合は `always` を選択します。
> - Turnstile / reCAPTCHA の設定を無効化する際は `CAPTCHA_PROVIDER=none` と `PUBLIC_CAPTCHA_PROVIDER=none` に戻すだけで OK です。

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
Strapi 管理画面初期化後、管理ユーザーを作成し、コンテンツタイプおよび権限が自動で適用されていることを確認します。初回起動時にデータベースマイグレーション（`comments.status` 列など）が適用され、コメントのステータス項目が Content Manager で編集可能になります。既存データベースに列が不足していた場合も、起動時のブートストラップ処理が `comments.status` と `comments.meta` 列を自動追加し、既存行のステータスを `pending` へ補正します。

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
1. **審査・公開**
   - Strapi 管理画面の「コンテンツマネージャー → Comments」で `pending` 状態の投稿を確認します（一覧列に「対象記事 / 投稿者 / 状態 / 投稿日時」が表示されます）。
   - 該当コメントを開き、右側の `status` プルダウンから `published` を選択し、画面右上の **保存** をクリックします。更新後は即座に Web 側へ反映されます。
   - 一覧画面のアクションメニューからでも「公開」「非表示」ボタンを押せます（カスタム API `/api/mod/comments/:id/(publish|hide|shadow)` を呼び出し）。
   - 非表示にしたい場合は `hidden`、投稿者のみに見せたい場合は `shadow` を選択します。
   - モデレーターとして公式返信する際は同画面でコメントを開き、`isModerator` をチェックするとフロントでバッジ表示されます。
2. **投稿者情報の確認**
   - コメント詳細画面右上の「︙」メニューから **JSON を表示** を選ぶと、`meta.client.ip`（平文 IP）と `maskedIp`、`ua`、`submittedAt` に加えて `meta.display.postTitle` / `postSlug` が確認できます。どの記事宛てかを即座に把握でき、管理画面から直接コピーできます。
   - API ベースで確認したい場合は管理者トークンで `GET /api/mod/comments/:id/meta` を呼び出してください。レスポンスには平文 IP、ハッシュ、ネットワークハッシュ、関連記事情報が含まれます。
   - API 呼び出し例（管理者 API トークンを使用）
     ```bash
     curl -H "Authorization: Bearer <ADMIN_API_TOKEN>" \
       https://cms.example.com/api/mod/comments/123/meta | jq
     ```
3. **IP / ネットワーク BAN**
   - 悪質な送信元は「Content Manager → Bans」で新規エントリを作成するか、コメント詳細ページの ID を使って `POST /api/mod/comments/:id/ban` を呼び出すとハッシュが自動入力されます。
   - どちらの API でも既定で過去コメントを一括削除（`purge`）。履歴を残したい場合のみ `purge=false` を指定してください。
   - `expiresAt` に日時を設定すると期限付き BAN、空欄の場合は無期限 BAN になります。`reason` に調査メモを残しておくと管理が容易です。
4. **管理画面での文脈確認**
  - Content Manager のコメント一覧に「対象記事」「状態」列を追加しているため、どの記事への投稿か・公開状態かをワンクリックで把握できます。詳細画面の JSON 表示からも `meta.client` 情報を確認できます。
5. **自動判定と通報**
  - 本文には禁止語・未許可ドメイン・過剰なリンク数のインデックスが適用され、該当した場合は `pending` として保存し、理由を `meta.moderation.reasons` に記録します。既定の `COMMENTS_AUTO_PUBLISH=smart` ではフラグに触れない投稿のみ自動的に `published` となり、すべてを手動承認したい場合は `manual` を指定します。
   - 読者は「スパム・広告 / 誹謗中傷 / 権利侵害 / その他」のいずれかを選んで通報できます。同一ブラウザから同じコメントを重複通報しても 1 件として扱われます。
   - 管理者は `POST /api/mod/comments/:id/report` で運営通報を追加でき、フロントでは「運営確認中」バッジを表示します。通報数は `meta.moderation.reportCount` に集計され、既定閾値（3 件）で自動的に `hidden` に移行します。

## セキュリティ
- 管理画面は OAuth / SSO 連携や IP 制限の併用を推奨
- `.env` や API トークンは OCI Secrets Vault または GitHub Secrets 等の安全なストアで管理
- CSP / Referrer-Policy / X-Content-Type-Options / 最小 CORS / CSRF 対策は既定設定済み

---

# テスト

## ユニット
- `/cms/src/extensions/comment/tests` にてコメント検証・レート制限等をテスト
- `npm run test` で Jest を実行

## E2E
- `/infrastructure/tests/e2e` に Playwright シナリオの雛形を用意
- コメント投稿〜モデレーション、BAN、Webhook 反映などをカバー

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
- **コメントが投稿できない**：CAPTCHA、BAN、禁止語・未許可リンクによる自動判定で `pending` になっていないか、URL ホワイトリストの設定を確認
- **Strapi ビルド時の `Bus error` (SIGBUS)**：Node 20 + Alpine でも動作するよう CLI をパッチ済みですが、メモリ 2GB 未満の環境では Vite が落ちる可能性があります。`npm run build` 実行前にメモリ割り当てを増やすか、公式 `strapi/strapi:5`（Node 18 ベース）でビルドする方法、またはローカルでビルド済み成果物をマウントする方法に切り替えてください。
- **`ERR_UNSUPPORTED_DIR_IMPORT: lodash/fp`**：本リポジトリでは `patch-package` と `scripts/run-strapi.mjs` により解消済みです。もし再発した場合は `npm install` でパッチが適用されているか確認し、独自に Strapi をアップグレードした際は `NODE_OPTIONS=--experimental-specifier-resolution=node npm run develop` を一時的に指定するか、Docker/Node 18 での実行を検討してください。
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

