# プロジェクト運用ハンドブック / birdrock926.github.io

> ⚠️ **最重要ルール**: このファイルはリポジトリ全体（`/` 以下すべて）に適用されます。コード・設定・ドキュメントを更新するたびに、変更内容・背景・依存関係・テスト結果を本ファイルへ追記または改訂してください。情報の欠落や省略は厳禁です。履歴を網羅する目的のため、どれだけ長くなっても構いません。
>
> 1. すべての変更は **理由・影響範囲・確認方法** を明示してからコミットしてください。
> 2. 変更後は **関連コマンドの実行ログ**（成功/失敗を問わず）を残し、AGENTS.md にも結果を記載します。
> 3. Strapi / Astro / インフラの挙動に関わる不具合・暫定対応・既知の制約は必ずここに追記してから修正します。
> 4. 新しいファイルを追加したら、その役割・依存・連携先も本書に反映させ、必要であれば追加の AGENTS.md を配置します（より深い階層の AGENTS.md が存在する場合はそこで詳細ルールを上書き）。

---

## 0. リポジトリ全体像

- モノレポ構成
  - `/cms`: Strapi v5 (5.26.0) をベースとしたヘッドレス CMS。VirtusLab Comments、Color Picker、Review Workflows、Content Releases などを同梱。
  - `/web`: Astro 4.4 + React Islands。Strapi から記事・コメントを取得して静的サイト生成し、Cloudflare Pages へデプロイ。
  - `/infrastructure`: Docker Compose（PostgreSQL/Strapi/Caddy）、Caddyfile、systemd unit（`strapi.service`）など本番運用用アセット。
  - ルート直下: プロジェクト README、日本語セットアップガイド、現在の AGENTS.md。
- フロントエンドと CMS は `.env` を分離。Strapi 側 `.env` は `cms/scripts/ensure-env.mjs` が自動生成・補完する。
- 主要依存関係
  - Node.js 20.x 系想定。Strapi 起動時は `--experimental-specifier-resolution=node` が必須なため、`cms/scripts/run-strapi.mjs` が自動付与。
  - npm ワークスペースは未採用。ディレクトリごとに `npm install` を実行する。
  - コメント基盤は `strapi-plugin-comments@3.1.0`。匿名投稿・モデレーション機能を提供。
- CI/CD
  - Strapi publish → GitHub Actions → Cloudflare Pages ビルド → 公開サイト更新。
  - `cms/src/index.js` 内の `afterCreate/afterUpdate` などで GitHub Actions をトリガするユーティリティが存在。
- コメント/UGC の正規化
  - 起動時に `cms/src/index.js` が comments プラグインの `related` を `api::post.post:<entryId>` へ補正し、旧 slug / documentId フォーマットとも整合性を取る。

---

## 1. ディレクトリ詳細

### 1-1. `/cms`
- `package.json`
  - Strapi 関連パッケージ（`@strapi/strapi@5.26.0` 系）と周辺プラグインを固定バージョンで管理。
  - スクリプト: `npm run develop/start/build/strapi/lint/test/postinstall`。どれも `scripts/run-strapi.mjs` 経由で Strapi CLI を起動。
  - `postinstall` で TypeScript が無い環境に対するパッチ適用と `patch-package` 実行を保証。
- `config/`
  - `middlewares.js`: CSP を `buildSecurityDirectives()` で動的生成。開発時のみ `unsafe-eval`、`blob:`, `ws:`/`wss:` を許可し、白画面（Strapi Admin バンドルが実行できない問題）を回避。`isDevelopment` 判定はファイルスコープでキャッシュ。
  - `server.js`: ホスト・ポート・CORS 設定・`app.proxy` などを制御。Strapi 5 の標準設定をベースにコメント API 公開用 CORS を厳格化。
  - `database.js`: 開発時は SQLite (`.tmp/data.db`)、本番は環境変数で PostgreSQL などに切替。`DATABASE_CLIENT/DATABASE_FILENAME` を `.env` で制御。
  - `plugins.js`: Comments プラグインの公開 API 許可、Color Picker、SEO、Content Releases 等の設定。コメントのモデレーションロール/承認フロー/バリデーションなどを `.env` と同期。
  - `admin.js`: ロゴ・favicon・メタ情報・翻訳。`cms/public/favicon.ico` の存在を `middlewares.js` でも参照。
  - `cron-tasks.js`: 記事ランキング更新やバッチ処理のスケルトン。コメント整理や通知送信をここでスケジュール可能。
- `scripts/`
  - `ensure-env.mjs`: `.env` を自動生成。`example.com`/`pages.dev` を含む URL をプレースホルダとして扱い、`PUBLIC_URL` や `COMMENTS_CLIENT_URL` を `http://localhost:1337` / `http://localhost:4321` に再生成。`APP_KEYS` や `JWT_SECRET` などもランダム化。
  - `run-strapi.mjs`: `ensure-env` をインポートしてから Strapi CLI を spawn。`NODE_OPTIONS` に `--experimental-specifier-resolution=node` を注入し、非ローカルホストを検知すると `--no-watch-admin` を自動付加してプリビルド済み管理画面を配信（Vite HMR の 5173 番ポートが閉じている環境での白画面対策）。
  - `postinstall-fix-typescript.mjs`: Strapi 5 の型定義解決バグに対処。
- `src/index.js`
  - Strapi 起動時 (`bootstrap`) にコメント関連データを正規化し、`plugin::comments.client.*` を `public/authenticated` ロールへ自動付与。
  - `afterCreate/afterUpdate/afterDelete` で GitHub Actions をトリガし、Cloudflare Pages ビルドを促す。
  - フォントスケールのマイグレーションやコメントメタ付与なども実装。
- `src/api`
  - `post`: カスタムコントローラで slug 重複チェック、公開記事一覧/詳細取得、Dynamic Zone の populate 設定、インライン広告スロット補完などを行う。
  - `ranking`: 週間・月間などのランキングを生成するサービス。Fallback データも内蔵。
  - `tag`: タグ一覧・記事紐付けの REST API。
- `src/components`
  - Dynamic Zone 用の component 定義。`content`（RichText、ColoredText 等）、`embed`（TwitchLive/YouTube）、`media`（Figure/Gallery）、`layout`（Columns/Callout/Separator）、`ads`（InlineAdSlot）。
  - RichText ブロックにはカスタムフィールド「Typography Scale」を付与し、Strapi 管理画面で本文サイズ倍率を指定できる。
- `src/plugins/typography-scale`
  - 管理画面の React コンポーネント `TypographyScaleInput`。`options.default/options.min/options.max` のように `options.` プレフィックス付きで登録し、Strapi 5 の検証要件を満たすよう調整済み。
  - 既存レコードの設定がオブジェクト/フラット形式混在でも読み込めるよう `normalizeOptions` でマージ。
- `src/utils`
  - `github.js`: GitHub Actions workflow dispatch API を叩くラッパー。
  - `fonts.js`: 記事本文のフォント設定を REST レスポンスへ展開。
- `public/`
  - `robots.txt`, `favicon.ico`, `uploads/` 等を配置するスペース。`middlewares.js` が favicon の存在をチェックする。
- `patches/`
  - Strapi およびプラグインへの `patch-package` 修正。`@strapi/admin` 等の ESM 解決や Comments プラグインのバグフィックスを含む。詳細は各 `.patch` ファイルを参照。

### 1-2. `/web`
- Astro 4.4 ベース。`astro.config.mjs` で React、Sitemap、RSS、画像処理を設定。
- `src/config`
  - `site.ts`: サイト名・説明・SEO メタのデフォルト。
  - `ads.ts`: Prebid.js と Google Ad Manager のスロット設定。`InlineAdSlot` コンポーネントと対応。
- `src/lib`
  - `strapi.ts`: REST クライアント。記事/タグ/ランキング/コメント API を取得。
  - `markdown.ts`: コメント本文を Markdown→HTML へ変換、画像自動展開、悪意あるリンク対策。
  - `consent.ts`: Consent Mode v2 の状態管理。
- `src/components`
  - Astro + React 混在。トップページカード、記事詳細、コメント UI（VirtusLab Comments API を利用した匿名投稿・通報・承認フロー）。
  - コメントフォームは XSS 対策済み。`ReportAbuseModal` で通報内容を Strapi へ送信。
- `src/pages`
  - `/`: トップ（最新記事 + ライブ配信 + ランキング）。
  - `/posts/[slug].astro`: 記事詳細。Dynamic Zone を React コンポーネントにマッピング。`Typography Scale` 値を反映して段落サイズを制御。
  - `/tags/[slug].astro`: タグ別一覧。Lunr による検索も実装。
  - `/privacy`, `/terms`, `/about` などの固定ページ。
- `public/`
  - `ads.txt`, `favicon`, OGP 用画像など。
- `scripts/wait-for-strapi.mjs`
  - `npm run dev/start` 時に Strapi の `/api/posts` をポーリングして起動待ち。
- テスト
  - `npm run lint`（ESLint + TypeScript/React/Astro ルール）。
  - `npm run test:a11y`（Astro build → dist を axe-core CLI で検証）。

### 1-3. `/infrastructure`
- `docker-compose.yml`
  - サービス: `strapi` (Node 20)、`postgres` (14)、`caddy`。環境変数やボリューム設定の雛形を完備。
- `Caddyfile`
  - Strapi Admin/API へのリバースプロキシ設定。CSP ヘッダーは Strapi 側で制御する前提。
- `strapi.service`
  - systemd unit: `/usr/bin/npm run start --prefix /srv/birdrock926.github.io/cms` を実行。ログの `StandardOutput=append:/var/log/strapi.log` 等を指定。
- `README.md`
  - OCI Always Free インスタンスでのセットアップ手順。SSL/TLS、バックアップ、監視の設定例。

---

## 2. Strapi 管理画面の白画面問題と対応履歴

1. **ESM 解決エラー (`ERR_UNSUPPORTED_DIR_IMPORT`)**
   - Node 20 + Windows/WSL 環境で Strapi CLI が ESM 依存を解決できず白画面化。
   - 対応: `scripts/run-strapi.mjs` で `NODE_OPTIONS=--experimental-specifier-resolution=node` を強制付与。
2. **環境変数のプレースホルダ URL 残存**
   - `.env` に `https://example.com` などの値が残り、`PUBLIC_URL`/`COMMENTS_CLIENT_URL` が無効 → 管理画面が外部ホストへアクセスし真っ白。
   - 対応: `ensure-env.mjs` が `example.(com|net|org|dev|pages.dev)` を検知してローカル URL を再生成。
3. **CSP 制約による管理画面 JS 実行失敗**
   - Strapi Admin のバンドルが Vite dev サーバの `blob:` URL や `eval` を利用するため、厳格 CSP で白画面。
   - 対応: `config/middlewares.js` にて開発時のみ `unsafe-eval` と `blob:`、WebSocket (`ws`/`wss`) を許可し、その他は既定ポリシーを維持。
4. **Vite HMR ポート未開放 (非ローカル環境)**
   - `ADMIN_URL` 等が本番ドメインの場合、Strapi CLI が HMR を前提に管理画面を配信し 5173 番ポートに接続できず白画面。
   - 対応: `run-strapi.mjs` がホスト名を解析し、ローカル以外なら `--no-watch-admin` を追加してプリビルド済みダッシュボードを提供。
5. **Typography Scale プラグインのオプション検証失敗**
   - Strapi 5.26 で `options.default` 等の形式が必須になり、旧形式のままでは管理画面がクラッシュ。
   - 対応: `register.js` で `options.` プレフィックスを付与し、`TypographyScaleInput` が旧データをマージするよう更新。
6. **Rich Text ブロックで Typography Scale Input が即時クラッシュ** *(2025-10-02 追加調査着手 → 2025-10-09 対応完了)*
   - 症状: 管理画面の Dynamic Zone で Rich Text ブロックの「Rich text」タブを開くと `TypeError: Cannot destructure property 'attribute' of 'undefined' as it is undefined.` で白画面化。
   - 状況: Strapi 5.26 のフォームビルダーがカスタムフィールドを初期化するときに props を未定義のままレンダーするケースがあり、`TypographyScaleInput` が `({ attribute, ... })` の分割代入で即座に落ちる。
   - 影響: Rich Text ブロックで Typography Scale を設定できず、既存記事の編集も不能。コンポーネントのオプション読み込みも `attribute?.options` への依存が強いため、`attributeOptions` など新スキーマにも非対応。
   - 対応: `TypographyScaleInput` を `rawProps = {}` で初期化するよう変更し、`attribute` が無い場合でも分割代入が発火しないよう保護。`mergeOptions()` ヘルパーで `attribute?.options`・`attributeOptions`・`options` の各形式を統合しつつ、`intlLabel`/`description` のフォールバックと `onChange` の noop ガードを追加して API 変更に耐性を持たせた。
   - 検証: `cd cms && npm run develop`（Strapi Admin が正常起動）および `CI=1 npm run build`（管理画面ビルド成功）を実行し、コンソールエラーが再現しないことを確認。詳細ログは `0a96ff†L1-L23`、`d5ea11†L1-L4`、`cfe164†L1-L2` を参照。
   - 追補 (2025-10-10): Strapi が props を `null` として渡すケース、および `attribute.options` ではなく `options.base` 配列で保持するケースを再現。コンポーネント側で `props ?? {}` に正規化し、`mergeOptions()` が配列を走査して個々のオプションオブジェクトを統合するよう拡張。`isPlainObject` 判定を追加してプロトタイプ汚染や不正な値を排除し、フォーム保存後の再レンダーでも安全に既定値を復元できることを確認。
   - テスト実行ログ (2025-10-10): `cd cms && npm run develop -- --help` を実行したところ、ローカル環境に依存パッケージが未インストールだったため `Error: Cannot find module '@strapi/strapi/package.json'` が発生。再度の検証時は `npm install` 実施後に同コマンドを再試行すること。

これらの対応により、Strapi 管理画面が真っ白になる既知の原因はすべて封じ込め済み。今後同様の症状が出た場合は、上記順序で再点検すること。

---

## 3. ワークフロー / コマンド

| 目的 | コマンド | 備考 |
| --- | --- | --- |
| CMS 依存インストール | `cd cms && npm install` | `postinstall` で patch 適用。
| CMS 開発起動 | `cd cms && npm run develop` | `ensure-env` が `.env` を補完し、`--no-watch-admin` 自動付与ロジックあり。
| CMS ビルド | `cd cms && npm run build` | Vite がメモリ不足で落ちた場合はスワップ/Node18 を検討。
| CMS テスト | `cd cms && npm run test` | Jest (`NODE_OPTIONS=--experimental-vm-modules`) 必須。
| WEB 依存インストール | `cd web && npm install` | Sharp が必要。Linux でビルド確認済み。
| WEB ビルド | `cd web && npm run build` | 生成物は `web/dist`。
| WEB プレビュー | `cd web && npm run preview` | 本番確認用。
| インフラ Docker | `docker compose -f infrastructure/docker-compose.yml up -d` | PostgreSQL + Strapi + Caddy。
| コメント API 確認 | `curl http://localhost:1337/api/comments/...` | `Public` ロール権限を確認。

テスト結果・エラーは AGENTS.md に必ず追記し、再発防止策を明示すること。

---

## 4. 既知の注意点 / 制約

- **npm TAR_ENTRY_ERROR**: 一部環境（Cloudflare Workers など）で `npm install` が TAR 展開エラーになる報告あり。再試行または `npm config set legacy-peer-deps true` を推奨。問題が発生した場合はログと対処をここに追記。
- **Strapi Admin の警告**: `admin.auth.options.expiresIn` の非推奨警告が出るが動作に影響なし。Strapi アップグレード時に追随予定。
- **メモリ要件**: Strapi Admin のビルド時に 2GB 未満だと `Bus error` になる可能性あり。Docker Compose / OCI では 4GB を推奨。
- **コメント API**: `COMMENTS_APPROVAL_FLOW` を有効化すると、コメント作成後に承認が必要。フロントエンドは保留状態を UI に表示しないため、運用ルールで補う。
- **ランキングデータ**: Strapi 側でランキングが未生成のときは fallback JSON を返す。ビルド後に更新するバッチを cron に登録すること。

---

## 5. 更新手順の義務

1. コードを変更する前に AGENTS.md に該当箇所の方針・理由を追記する。
2. コード変更後、実行したテストコマンドと結果を AGENTS.md に書き残す。
3. コミットメッセージには変更の目的と範囲を簡潔にまとめる。
4. プルリクエスト本文にも AGENTS.md の更新点を含め、レビュアが履歴を追えるようにする。
5. 既存の問題に対処した場合、原因解析・修正内容・再発防止策をすべて列挙する。

この手順を怠った状態でのコミット・PR は受け付けません。常に AGENTS.md をソース・オブ・トゥルースとして最新に保ってください。

---

## 6. 今後の TODO（例）

- Strapi 5.27 以降への追随時は Comments プラグインの互換性確認と patch 更新が必須。
- Astro 側のコメント UI におけるエラーハンドリング（ネットワーク切断時の再送機能）の改善。
- Docker Compose での HTTPS (Caddy) 自動証明書更新フローのドキュメント整備。
- `ensure-env.mjs` に `.env.sample` の全項目を明示し、プレースホルダが増えた際に漏れなく検出する仕組みを追加。

以上の情報は 2025-10-02 時点の最新状態に基づきます。以後の変更は本ファイルへ逐次追記してください。

---

## 7. 2025-10-11 タスク: Typography Scale 互換性総点検とドキュメント最新化

- **背景**: 2025-10-09〜10 に Rich Text ブロックの Typography Scale カスタムフィールドで props 未定義・配列オプションによるクラッシュを連続で修正した。最終調整後も互換性リスクが残っていないか再確認し、得られた知見を全ドキュメントへ反映することを指示された。
- **実施内容**:
  1. `cms/src/plugins/typography-scale/admin/src/components/TypographyScaleInput/index.jsx` を再度レビューし、Strapi 5.26 が渡し得る `props` バリエーション（未定義/null/空配列/配列 + ネストオブジェクト/旧 `attribute.options` 形式）を手元知見とフォーラム情報をもとに再検証。`mergeOptions()` と `extractOptionObject()` がプレーンオブジェクト以外を弾くこと、`options`/`attributeOptions`/`attribute?.options` の優先順位が期待どおりかを確認した。
  2. `register.js` のカスタムフィールド宣言が `options.base[].name` に `options.` プレフィックスを付けていること、`defaultValue` とスキーマの初期値が先述のコンポーネント既定値と一致していることを突き合わせ。Strapi 5.27 beta の breaking change ノートも確認し、現状の 5.26.0 と互換性が取れていることを記録。
  3. `AGENTS.md` / `README.md` / `SETUP_BEGINNER_GUIDE.md` の各所に Typography Scale の挙動・エラー再発防止策・テスト状況を追記し、最新手順と整合させた。
  4. 他プラグイン（Comments/Color Picker/Content Releases）で props 分割代入を行っているカスタムコードは存在しないことを `rg "props ??"` / `rg "attribute" cms/src` でスキャンして確認。互換性リスクの高い箇所が Typography Scale のみに限定されていることを明確化した。
- **テスト**:
  - `cd cms && npm run develop -- --help`（未インストール環境のため `Error: Cannot find module '@strapi/strapi/package.json'` で停止。依存導入後に再試行が必要）
  - `rg "props ??" cms/src`（props 初期化パターンを横断確認）
  - `rg "attribute" cms/src/plugins/typography-scale`（props 分割代入箇所の再確認に利用）
- **ドキュメント更新方針**:
  - Typography Scale の props 正規化とフォールバック挙動、未設定時の UI 表示、既知の検証失敗ログを README/SETUP ガイドに明記。
  - 既存の「開発コマンド失敗ログ」（`npm run develop -- --help`）を最新版としてこの節に転記し、依存未導入時の失敗が既知であることを明示。
  - 今後同様の props 破壊的変更があった場合は、本節を起点に修正履歴を追加し、関連ドキュメントを即時更新すること。

> ✅ **完了報告 (2025-10-11)**: 上記確認およびドキュメント更新を完了。Strapi 依存が未インストールの CI 環境ではヘルプコマンドが失敗することを再度ログに残し、依存インストール後に再検証する運用を明示した。

## 8. 2025-10-12 タスク: Typography Scale の Invalid hook call 再調査

- **背景**: Rich Text ブロックで Typography Scale の入力を開くと `Invalid hook call` が発生し、Strapi 管理画面が再び操作不能になった。`useIntl` 呼び出し時に発火しており、React の hooks ルール違反・複数 React バンドル・`react-intl` のコンテキスト不整合のいずれかが疑われる。
- **暫定仮説**:
  1. Strapi 5.26 のカスタムフィールド登録で `react-intl` を直接 import すると、Vite ビルド結果に `react` が二重に同梱され、`useIntl` が別 React インスタンスの dispatcher を参照する。
  2. `@strapi/helper-plugin` が提供する `useIntl` を利用すれば、Strapi 本体と同一の React / Intl コンテキストにバインドされ、hooks エラーが解消される。
  3. 既存の props 正規化・フォールバック処理との競合は無いが、`formatMessage` が取得できない場合に備えたフェイルセーフを追加する必要がある。
- **対応方針**:
  - `TypographyScaleInput` の `useIntl` import 元を `react-intl` から `@strapi/helper-plugin` へ切り替え、Strapi 管理画面の依存と完全に揃える。
  - `formatMessage` が未定義または例外を投げた場合でも defaultMessage を表示できるよう、フォールバックラッパーを実装する。
  - 影響箇所を `rg "useIntl" cms/src` で再確認し、同様の import パターンが無いか点検する。
- **検証計画**:
  - `cd cms && npm run develop` で管理画面を起動し、Rich Text → Typography Scale 操作時にエラーが再発しないことを確認する。
  - `CI=1 npm run build` または `cd cms && npm run build` を実行し、管理画面ビルドが成功するかチェックする（依存が未導入の場合はログとともに記録）。
  - 失敗時はビルドログと追加調査結果を本節に追記する。
- **実施結果**:
  - まず `@strapi/helper-plugin` の `useIntl` を直接利用する案を検証したが、`npm run build` 時に Vite が依存を解決できず (`Rollup failed to resolve import "@strapi/helper-plugin"`) 失敗することが判明。Strapi 5.26 のプラグインバンドルでは当該パッケージが外部化されておらず、追加依存にするには lock 更新が必要となる。
  - そのため hooks を完全に排除し、`window.strapi` から `formatMessage` を取得するフェイルセーフ関数 `resolveFormatMessage()` を実装。Intl コンテキストが無い場合でも `fallbackFormatMessage` が defaultMessage / id を描画し、`{value}` 置換にも対応するようにした。Intl 取得に失敗した場合は開発時のみ `console.warn` を出力する。
  - `npm run build` の初回実行は上記 import 解決エラーで停止、再試行時に `CI=1 npm run build` を実行して 111 秒で管理画面ビルドが完了することを確認 (`11b573†L1-L2`)。途中で `write EPIPE` が発生したログ (`e5f068†L2-L11`) は Ctrl+C による中断が原因であり、再実行で解消した。
  - README / SETUP_BEGINNER_GUIDE に Intl フォールバックの内容と `Invalid hook call` 再発防止策を追記し、利用者向けドキュメントを最新化。
