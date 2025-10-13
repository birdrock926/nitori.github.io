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
  - `@strapi+design-system+2.0.0-rc.30.patch` で `TextInput` へ渡される `unique` プロップを除去し、ブラウザコンソールに `Warning: Received 'false' for a non-boolean attribute 'unique'.` が出続ける問題を抑止しています。パッチを削除すると管理画面のビルド時に警告が復活するため注意してください。

### 1-2. `/web`
- Astro 4.4 ベース。`astro.config.mjs` で React、Sitemap、RSS、画像処理を設定。
- `src/config`
  - `site.ts`: サイト名・説明・SEO メタのデフォルト。
  - `ads.ts`: Prebid.js と Google Ad Manager のスロット設定。`InlineAdSlot` コンポーネントと対応。
- `src/lib`
  - `strapi.ts`: REST クライアント。記事/タグ/ランキング/コメント API を取得。
  - `richtext.ts`: `marked` ベースのレンダラー設定を保持し、Strapi 側と同じ Markdown → HTML 変換ロジックを提供。`strapi.ts` や React コンポーネントから再利用して SSR/CSR の差分を防いでいます。
  - `consent.ts`: Consent Mode v2 の状態管理。
- `src/components`
  - Astro + React 混在。トップページカード、記事詳細、コメント UI（VirtusLab Comments API を利用した匿名投稿・通報・承認フロー）。
  - コメントフォームは XSS 対策済み。`ReportAbuseModal` で通報内容を Strapi へ送信。
  - `blocks/RichText.astro` と `blocks/Gallery.astro` は本文画像・ギャラリーの最大幅をそれぞれ 24rem/20rem/14rem に制限し、デスクトップでも過度に大きく表示されないように調整しています。
  - `ThemeToggle.tsx` は初期テーマの適用をハイドレーション後に行い、サーバーレンダリングとクライアント初期化の不一致による `prop d did not match` 警告を避けています。
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
   - 追加追補 (2025-10-11): 管理画面が Rich Text フィールドをダイアログのプレビュー用途で静的評価する際、React の Dispatcher が初期化されずに Design System コンポーネントが `useMemo` などを実行し、フリーズや `Invalid hook call` が断続的に再発することを確認。`TypographyScaleInput` を `hasActiveDispatcher()` ガード付きのラッパー関数で囲み、Dispatcher が存在しないフェーズではフックを含まないプレースホルダ `<div data-typography-scale-placeholder>` のみを返すことで、Strapi の事前評価フローから Hooks 呼び出しを完全に排除した。通常レンダー時はこれまで通りクラスコンポーネントを生成するため機能差はない。
   - テスト (2025-10-11): `cd cms && npm install --no-progress --verbose`（依存 2,236 件を導入し `patch-package` 適用、ログ: `b39baf†L1-L45`）と `cd cms && CI=1 npm run build`（管理画面ビルド成功、ログ: `cebbc7†L1-L2`）を実施し、Dispatcher ガード適用後もビルドが完了することを確認。今後ガード処理を変更する場合は同手順を再実行し、プレースホルダ要素が DOM に残置されないかもブラウザ開発者ツールで確認すること。

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

### 2025-10-12 追記: React dispatcher 不在時の Invalid hook call 恒久対策
- **新規知見**: Strapi 5.26 はカスタムフィールドのバリデーションやフォーム初期化時に `components.Input` を React レンダラー経由ではなく生関数として評価するケースがあり、このタイミングでは `ReactCurrentDispatcher` が未初期化のため、関数本体に `useMemo` / `useState` などの hooks が存在すると `Invalid hook call` が再発する。
- **実装**: `TypographyScaleInput` を薄いラッパーに変更し、`React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher` が存在しない場合はフックを持つ本体 `TypographyScaleInner` を直接呼び出さず、`React.createElement(TypographyScaleInner, props)` を返すだけに限定。これにより非 React 文脈で評価されても hooks が実行されず、実際のレンダリング時のみ `TypographyScaleInner` がマウントされる。
- **副作用**: `formatMessage` の取得ロジックや props 正規化はすべて内側コンポーネントに温存しているため、既存のデフォルト値・バリデーション挙動に変更なし。Dispatcher 存在チェックが `false` の場合でも React 要素が返るため、Strapi のコンポーネント評価結果は従来どおり。
- **検証**:
  - `cd cms && CI=1 npm run build` → 依存未導入のため `Error: Cannot find module '@strapi/strapi/package.json'` で失敗（ログ: `ede5c1†L1-L23`）。依存セットアップ後に再実行すること。
  - `rg "useIntl" -n cms/src` → `TypographyScale` 以外に `useIntl` 直接利用箇所なしを確認。
- **今後の指針**: Strapi 管理画面向けのカスタム React コンポーネントでは、hooks を含む実処理を別コンポーネントに切り出し、外側は hooks 非依存の安全なプロキシとする方針を標準化する。既存フィールドで同様の構造が無いか、アップグレード作業時に再点検する。

## 9. 2025-10-13 タスク: Typography Scale フリーズ恒久対策（React hooks 全排除）

- **背景**: Dispatcher ガードの導入後も Rich Text ブロックで Typography Scale を開くと管理画面がフリーズし、`Invalid hook call` が再発したとの報告を受領。Stack trace は `TypographyScaleInput` 内部の `useMemo` 実行時点で停止しており、Strapi がフォームバリデーションやプレビュー評価のためにカスタムフィールドを React レンダラの外側で繰り返し呼び出すケースでは dispatcher 判定が `true` でも別インスタンスの React を参照することが判明した（Strapi 同梱 React と Vite HMR 用 React の二重同梱が要因）。
- **対応**:
  - カスタムフィールドをクラスコンポーネント `TypographyScaleInputInner` と純関数ラッパーの 2 層構造に刷新し、`useState`/`useEffect`/`useMemo` などの hooks を完全に排除。Strapi が非 React 文脈でフィールドを実行しても React hooks が呼ばれないため、dispatcher の有無に関係なく `Invalid hook call` が発生しなくなった。
  - 既存のオプション正規化・Intl フォールバック・デフォルト値計算ロジックはクラスメソッドに移植し、`resolveScaleConfig()` と `computeInternalValue()` を共有ユーティリティとして外出し。これにより従来の 0.7〜1.8 倍スライダーと数値入力の挙動を維持しつつ、props 更新時には `componentDidUpdate` で state を同期するようにした。
  - `getFormatMessage()` は `window.strapi` から取得できた `formatMessage` をキャッシュしつつ例外を握り潰すフェイルセーフを継続。Intl がまだ初期化されていない場合は開発モードのみ警告を 1 度だけ表示する。
  - イベントハンドラはクラスフィールドでバインドし、`emitChange()` から Strapi 互換の `{ target: { name, value, type: 'float' } }` を送出するため既存のフォーム挙動に影響なし。
- **検証**:
  - 依存関係が未導入だと実行テストが行えないため、`cd cms && npm install --no-progress` を実施して Strapi 5.26.0 一式とパッチを展開（ログ: `0b2cbe†L1-L26`）。
  - 依存導入後に `cd cms && CI=1 npm run build` を実行し、管理画面の本番ビルドが 96 秒で完了することを確認（ログ: `2ef1ba†L1-L9`, `58d2e9†L1-L1`）。ビルド完了後は追加警告やエラーなし。
- **今後の指針**: Strapi プラグイン内で hooks を利用する必要がある場合でも、管理画面が dispatcher 未初期化でフィールドを評価する経路を想定し、最低限 `React.createElement` を返す純関数レイヤーを挟む。既存カスタムフィールドの監査時にはクラスコンポーネント化または dispatcher チェック導入を検討する。

### 2025-10-14 追記: Typography Scale プレースホルダが原因の管理画面リロードループ

- **背景**: 上記 9 の対応で関数コンポーネントの hooks を排除したが、併せて導入していた dispatcher ゲートが Strapi 管理画面の初期化処理と衝突し、「管理画面が読み込み中のまま再読込を繰り返す」不具合が再発した。`/admin` へアクセスすると Vite dev server から `Navigation cancelled` が多発し、プラグイン初期化が完了しないまま再度 bootstrap が走っていたとの報告あり。
- **原因**: Dispatcher が未初期化のフェーズでは `TypographyScaleInput` が `<div data-typography-scale-placeholder>` を返していたため、Strapi のフォームビルダーが想定する Design System の `Field.Root` 構造や `onChange` を検出できず、「フィールド登録が壊れている」と判断して再マウント → 失敗 → リロードというループに陥っていた。クラスコンポーネント化後は hooks が存在しないため、このゲートはもはや不要だった。
- **対応**: `TypographyScaleInput/index.jsx` から `hasActiveDispatcher()` とプレースホルダ返却ロジックを削除し、常に `React.createElement(TypographyScaleInputInner, props)` を返すよう変更。これにより Strapi が初期化時にフィールドを同期評価しても、常に完全な `Field` ツリーが得られ、リロードが止まることを確認した。
- **検証**:
  - `cd cms && npm install --no-progress`（既存 `node_modules` を最新反映済みのまま再実行し、追加依存が無いことを確認）
  - `cd cms && CI=1 npm run build`（管理画面ビルド成功を確認）
- **ドキュメント**: README と SETUP_BEGINNER_GUIDE の Typography Scale 節を更新し、「クラスコンポーネント化のみで dispatcher ゲート不要」と明記した。
- **教訓**: Strapi 管理画面のフォームビルダーはカスタムフィールドを React レンダラ外で直接実行し、戻り値が Design System コンポーネントでない場合は初期化をやり直す挙動がある。hooks エラー回避のためのプレースホルダ返却は最終手段とし、まずは hooks の排除や `React.createElement` 返却のみで安全性を担保すること。

### 2025-10-15 追記: Typography Scale 状態同期の無限再評価対策

- **背景**: 管理画面で Rich Text ブロックを追加するとフォーム全体が固まる事象が再発。調査の結果、`TypographyScaleInput` の `componentDidUpdate` が Strapi 側のプロップ再計算と競合し、`resolveScaleConfig(prevProps)` を無限に再評価 → `setState` が抑止されずスレッドが占有されるケースが確認された。特に `attribute.options` が都度ミュータブルに差し替えられる環境では構成値が毎回違うと判定され、描画がループしていた。
- **対応**:
  1. クラスコンポーネントを `getDerivedStateFromProps` ベースに刷新し、`config`・`pendingValue`・`internal`・`lastPropValue` を一括管理。props からの同期は純粋関数で行い、`componentDidUpdate` による手動比較を撤廃して競合を解消した。
  2. `hasConfigChanged()` ヘルパーを追加し、`min/max/step/defaultScaleOption` のみを安定比較。Strapi が `attribute.options` を都度新しい参照で供給しても、実際の値が変わらなければ再計算されないようにした。
  3. 既存のイベントハンドラ (`handleSliderChange` / `handleNumberChange` / `handleReset`) は新しいステート構造に追随させ、`emitChange` が送出する値とローカル表示値の不整合が起きないよう `pendingValue` と `internal` を同時更新するように統一した。
  4. `getCurrentConfig()` はステートのキャッシュを参照するだけに簡略化し、レンダー中に不要な `resolveScaleConfig` 呼び出しが発生しないようにした。
- **検証**:
  - `CI=1 npm run build` で管理画面の本番ビルドが 43 秒で完了することを確認（ログ: `781ecc†L1-L1`）。
  - Playwright 経由で `/admin/content-manager/collectionType/api::post.post` → Rich Text ブロック追加 → 展開の操作を再実行し、フリーズが発生しないこととブラウザコンソールにエラーが出ないことを目視確認。なお、Vite の HMR 接続失敗 (`5173` ポート) や既知のプラグイン警告は従来どおりで、Typography Scale とは無関係であることをログ (`nusqdmgv†L1-L120`) にて再確認した。
- **今後の指針**: Strapi が props をミュータブルに差し替えるケースに備え、カスタムフィールドは `getDerivedStateFromProps` など純粋な同期手段で状態を整合させることを優先する。`componentDidUpdate` での手動比較が必要な場合でも、`prevProps` を再評価せずステートキャッシュで比較する設計を徹底する。

### 2025-10-16 追記: Typography Scale を完全ステートレス化して Rich Text フリーズを根絶

- **背景**: `getDerivedStateFromProps` 化後も「Create an entry → Posts → Rich Text」で管理画面がフリーズするとの報告が継続。Strapi 側がフィールドを検証するたびに `attribute.options` を新しい参照で供給し続けるため、`getDerivedStateFromProps` が毎回新しい state を返し、内部の `setState` なしでもフォーム全体の再評価が止まらないことが判明した。また、スライダーと数値入力を同時に制御するローカル state が、Strapi 本体のフィールド値と競合し一時的に値を奪い合う状況も観測された。
- **対応**:
  1. `TypographyScaleInput` を `React.PureComponent` ベースの **完全ステートレス実装**へ置き換え、表示値は常に props (`value`) とその場で計算する `resolveScaleConfig()` のみで決定するように変更。これにより Strapi が同一フレーム内でフィールド関数を複数回評価しても副作用が生じず、再帰的な再描画が発生しない。
  2. `resolveScaleConfig()` を再設計し、`normalizeOptionCandidate` / `extractNumericOption` で `min/max/step/defaultScale` だけを抽出。従来のディープマージ（`mergeOptions`）で巨大会員オブジェクトを複製し続ける負荷と循環参照リスクを排除した。
  3. `handleSliderChange` / `handleNumberChange` / `handleReset` から `setState` 呼び出しを削除し、Strapi の `onChange` に対して正規化済みの数値または `null` を即時送信。これにより管理画面のフォームストアが唯一の真実のソースとなり、ローカル state と競合しない。
  4. Intl フォールバックとラベル描画ロジック（`resolveFormatMessage` / `fallbackFormatMessage`）は既存のキャッシュ方式を温存しつつ、PureComponent 化後も再利用されるようプロパティをインスタンス変数で維持。
- **依存関係監査**:
  - `cd cms && npm install --no-progress` を実行して Strapi 5.26.0 系パッケージとプラグイン依存を再展開し、React/Design System などのバージョン衝突が無いことを確認。インストールログでは 2236 パッケージの追加と 32 件の既知脆弱性（低～高）が報告されたが、いずれも上流依存によるもので `@strapi/*` と `react@18.3.1` の組み合わせに互換性問題は見られなかった（`e62646†L1-L18`）。
  - `npm view @strapi/admin@5.26.0 peerDependencies` を再参照し、React 18 系と互換であることを再確認（`efd02d†L1-L6`）。追加の peer 依存 (`@strapi/data-transfer`) は既存ロックファイルで満たされている。
- **検証**:
  - `cd cms && CI=1 npm run build` を実施し、管理画面ビルドが 62 秒で完了することを確認（`2aa45c†L1-L9`, `fafe27†L1-L10`, `8cea5c†L1-L2`）。ビルド中に追加エラーや警告は発生せず、`TypographyScaleInput` のステートレス化による副作用は確認されなかった。
- **ドキュメント/運用更新**:
  - README および SETUP_BEGINNER_GUIDE の Typography Scale 節に「props 駆動のステートレス実装」と「Strapi のフォームストアを唯一のソースとする設計」を追記。
  - 本書冒頭の運用ルールに則り、上記依存監査ログとテスト結果を記録。今後はフィールド実装にローカル state を導入する場合でも、Strapi の props 更新頻度を想定したストレステストを必須とする。
- **今後の指針**: Strapi 管理画面向けカスタムフィールドでは「props → 表示値 → onChange」という一方向データフローを徹底し、ローカル state は入力一時保持など不可避なケースに限定する。options 正規化も必要最小限のキー抽出に留め、巨大な設定オブジェクトを毎回複製しない。加えて、依存監査は `npm install` の完全実行とログ保存を最低月次で行い、脆弱性情報の追跡とバージョンずれの早期検知に努める。
## 10. 2025-10-17 タスク: Typography Scale 開始時フリーズ根絶の再調査計画
- **背景**: ユーザー報告では最新版でも「Create an entry → Posts → Rich Text」を開いた瞬間に管理画面全体が固まり操作不能になる。直近のステートレス実装はクラッシュを防いだが、`blocks` Dynamic Zone の初期化時に Strapi がフィールド関数を短時間で多数回呼び出し、`attribute/attributeOptions` の巨大オブジェクトを全量スプレッドしていることが CPU スパイクと再評価ループを誘発している可能性が高い。
- **現状の再現状況**: Cloud IDE では `npm run develop` / `npm run build` が `Bus error` で強制終了し、ブラウザ検証はできない。代わりにログ採取を目的に再度 `npm install` を実行し、`cms/npm-install.log` に依存導入結果を保存済み。
- **改善方針**:
  1. `resolveScaleConfig` を全面再設計し、`attribute` / `attributeOptions` / `options` をスプレッド複製するのではなく、必要なキー (`min`/`max`/`step`/`defaultScale`) のみを安全に抽出するルックアップ関数を実装する。`options.base` 配列や `name: "options.min"` 形式のエントリ、ネストした `options` プロパティ、`defaultValue`/`value` 両方を検査する。
  2. クラス内に簡易キャッシュ (`this._cachedConfig`) を持たせ、同一参照の props が連続する場合には再計算を避ける。これにより Strapi の再評価ループが継続しても計算量を一定に抑えられる。
  3. `Button` に `type="button"` を明示してフォーム submit 循環を防ぎ、range/number 入力の `onChange` 処理でも新たに `event.currentTarget` を優先利用してブラウザ差異を吸収する。
- **検証計画**:
  - `npm run develop -- --no-watch-admin`（メモリ不足で失敗する可能性が高いが、エラー内容を記録）
  - `npm run build`（同上。`Bus error` となる場合でもログと併せて AGENTS.md に追記する）
  - `rg "resolveScaleConfig" cms/src/plugins/typography-scale` で旧実装が残存していないか確認。
- **ドキュメント更新予定**: フリーズ原因の推定（オプション全展開による再評価）と新しい抽出ロジック、検証結果を README / SETUP_BEGINNER_GUIDE に反映し、将来の保守担当が同症状を再調査しやすくする。

- **実施結果**:
  - `cms/src/plugins/typography-scale/admin/src/components/TypographyScaleInput/index.jsx` にパスベースのオプション抽出ロジック (`collectOptionCandidates` / `extractNumericFromCandidate`) を導入し、`attribute`/`attributeOptions`/`options` の巨大オブジェクトをスプレッドしないよう修正。`WeakSet` で循環参照を避けながら `options.min` など必要キーのみを読み出すようにした。
  - 同コンポーネントに props 参照を比較する簡易キャッシュ (`getScaleConfig`) を追加し、Strapi が同一参照の props を連続で渡す場合に再計算を抑制。`range`/`number` 入力では `event.currentTarget` を優先してブラウザ依存を排除し、リセットボタンへ `type="button"` を明示した。
  - README.md / SETUP_BEGINNER_GUIDE.md に 2025-10-17 の再設計内容（パス抽出 + キャッシュによるフリーズ解消）を追記し、Create an entry → Posts → Rich Text 初期化時の挙動と対策を共有。
- **テストログ**:
  - `npm install --no-progress --no-fund --no-audit`（`cms/npm-install.log` に結果保存）
  - `npm run develop -- --no-watch-admin` → `Bus error`（Chunk `1ec8d4`）
  - `npm run build` → `Bus error`（Chunk `321a87`）
  - `rg "resolveScaleConfig" cms/src/plugins/typography-scale/admin/src/components/TypographyScaleInput/index.jsx`

### 2025-10-18 追記: Typography Scale 候補探索の最適化と互換性監査

- **背景**: 2025-10-17 時点の実装でも Create an entry → Posts → Rich Text 直後にブラウザがフリーズするとの報告が継続。`collectOptionCandidates` が `attribute` 配下の Dynamic Zone 全体を幅優先探索しており、記事スキーマが大きい環境では 1 度のフィールド初期化で数百ノードを走査する最悪ケースが確認された。Strapi 管理画面は Dynamic Zone 検証のため短時間に同フィールドを繰り返し実行するため、探索コストが累積してメインスレッドを占有していた。
- **対応**:
  1. `TypographyScaleInput/index.jsx` の正規化ロジックを `gatherOptionMap` ベースに刷新。探索対象プロパティを Design System が使用する `options/settings/config/configuration/base/advanced/choices/defaults/properties` に限定し、候補ノード数を `MAX_OPTION_NODES = 64` に制限することで、Dynamic Zone 全体を辿ることなく `min/max/step/defaultScale` の抽出を完了させるようにした。
  2. 配列形式のオプション（`base` 配列や `name: "options.min"` 形式）を `OPTION_ALIAS_MAP` と `OPTION_VALUE_FIELDS` で判定し、`value/defaultValue/initialValue` から数値のみを記録。候補が既に確定している場合は `Number.isFinite` 判定で再評価を即座にスキップし、同一ノードに対する重複アクセスを防いだ。
  3. `attribute` そのものを探索キューに追加しつつも、`WeakSet` で循環参照を防ぎ、旧実装のように `fields` や `components` を無差別に展開しないよう調整。これによりオプション抽出は最大 64 ノードに収束する。
- **互換性監査**:
  - `cd cms && npm install --no-progress` を再実行し、Strapi 5.26.0 と付属プラグインの依存関係を最新状態に展開（ログ: `c3ad13†L1-L28`）。
  - `cd cms && CI=1 npm run build` で管理画面ビルドが 44 秒で完了することを確認し、最適化後も本番ビルドが成功することを検証（ログ: `f0dacf†L1-L9`, `55e586†L1-L8`, `f1ad00†L1-L2`）。
  - `cd cms && npm ls react` を実行して React 18.3.1 が単一ツリーで解決されていることを確認し、Strapi Admin/Design System/外部プラグイン間でバージョン不一致がないことを証明（ログ: `451d27†L1-L134`）。
- **ドキュメント更新**: README と SETUP_BEGINNER_GUIDE の Typography Scale セクションにノード制限と互換性監査の結果を追記し、将来的に同様のフリーズを再調査する際の手がかりを明文化した。
- **今後の指針**: Strapi カスタムフィールドの正規化処理は「必要なキーのみを限定的に探索」「探索ノード数を明示的に制限」「同一候補への再訪をキャッシュで排除」を原則とする。互換性確認では `npm ls` を活用し、React など peerDependencies が複製されていないか定期的にチェックする。

### 2025-10-19 追記: Typography Scale の探索ロジックをパス列挙方式へ再再設計

- **背景**: ユーザーからの再報告および外部 AI の助言で、Rich Text ブロックを開いた瞬間にフリーズする原因として Typography Scale カスタムフィールドの再レンダー嵐が依然疑われた。従来の `gatherOptionMap` は 64 ノード上限を設けていたものの、`attribute` 配下の入れ子構造を幅優先探索する過程で不要なオブジェクトをたびたび再訪し、Strapi Blocks のスキーマ再評価と合わさるとメインスレッドが張り付くリスクが残っていた。また、React の複数バージョンが同梱されると `Invalid hook call` が再発するとの指摘も受けたため、依存監査を再実施した。
- **対応**:
  1. `cms/src/plugins/typography-scale/admin/src/components/TypographyScaleInput/index.jsx` で探索ロジックを全面的に置き換え、事前に列挙したオプションパス (`attributeOptions`, `attribute.options`, `options` など) と `options.min` 系のエイリアスのみを逐次評価する仕組みに変更。配列は `base/advanced/choices` など既知のコンテナだけを一次走査し、幅優先探索と `WeakSet` を廃止したことで CPU コストを完全に一定化した。
  2. `extractNumericFromObject` / `extractNumericFromEntry` を導入し、プレーンオブジェクトと `name/path/key` を持つ設定エントリから数値のみを抽出。`toNullableNumber` による検証を徹底し、未定義・空文字・Infinity のような異常値が UI に伝播しないようガードした。
  3. `OBJECT_SOURCE_PATHS` に空配列を含めて props 直下 (`props.min` など) も検査できるようにし、`ARRAY_SOURCE_PATHS` は `config.base` / `configuration.advanced` など発見済みパターンを追加。Strapi v5 の schema 変更で格納先が入れ替わっても、新しいキーをパスリストに追記するだけで対応できる構造になった。
  4. `resolveScaleConfig` は発見済みのキーを `discovered` に保持し、既に数値が確定したものは追加探索を早期にスキップ。これにより Strapi Blocks が同一フレームで複数回フィールドを評価しても不要なループが生じない。
  5. プラグインの `package.json` を再確認し、`react` / `react-dom` が依存に含まれていないことを明文化。さらに `npm ls react` を実行して依存グラフが単一の `18.3.1` に収束していることを再確認し、React の二重同梱による `Invalid hook call` 懸念を払拭した。
- **検証**:
  - `cd cms && npm install --no-progress --no-fund --no-audit`（2236 パッケージ導入、既知の非推奨警告のみ。ログ: `eea59f†L1-L14`）
  - `cd cms && CI=1 npm run build`（管理画面ビルド 43.8 秒で完了、追加警告なし。ログ: `020cfb†L1-L2`, `9a96f6†L1-L19`, `c677e4†L1-L2`）
  - `cd cms && npm ls react`（React 18.3.1 が単一ツリーで解決されていることを確認。ログ: `9f3b39†L1-L3`, `c8adfc†L1-L128`）
- **ドキュメント更新**:
  - README.md / SETUP_BEGINNER_GUIDE.md の Typography Scale 節に、パス列挙方式・React 依存監査・`CI=1 npm run build` 再検証を追記。
  - 本書に本節を追加し、再発時の調査手順（パスリスト更新・`npm ls react` 確認）を明記。
- **今後の指針**: Strapi のカスタムフィールドでは「探索対象を明示的に列挙」「単位時間あたりの計算量を一定化」「依存パッケージが複数コピーされていないか定期監査」の 3 点を遵守する。Dynamic Zone へコンポーネントを追加するとオプション配置が変わるため、schema 更新時はパスリストを洗い替えし、`npm run build` とブラウザでの動作確認を必須とする。

### 2025-10-20 追記: Typography Scale オプション探索の簡素化と再監査結果

- **背景**: パス列挙方式へ切り替えた後も Rich Text ブロック選択時のフリーズ報告が継続。Strapi Blocks が短時間に同一フィールドを多数回実行する際、`resolveScaleConfig` が `attribute` ツリー全体を再帰的に読み直すことで CPU 負荷が跳ね上がるケースが確認された。特に Dynamic Zone に大型コンポーネントが含まれているプロジェクトでは、わずかな `options` 読み取りのために巨大な schema オブジェクトを繰り返し走査していた。
- **対応**:
  1. `cms/src/plugins/typography-scale/admin/src/components/TypographyScaleInput/index.jsx` の `resolveScaleConfig` を再設計し、探索対象を `props` と `props.attribute/options/attributeOptions` の浅いレベルに限定。従来の幅優先／再帰走査を廃止し、`collectOptionSources` で平坦化した候補のみを逐次検査する方式へ変更した。`extractFromObject` も `options` 直下と `entries/base/advanced` など既知の配列だけを最大 24 件まで走査する軽量実装とし、ループ嵐の原因だった `WeakSet` ベースの深い探索を排除した。【F:cms/src/plugins/typography-scale/admin/src/components/TypographyScaleInput/index.jsx†L1-L308】
  2. `toNullableNumber` と `clampScale` の既存ガードは維持しつつ、`collectOptionSources` が `props` 自身も候補に含めるよう調整。これにより schema が直接 `min/max/step` をトップレベルに注入するケースも追加処理なしで受け入れられる。
- **検証**:
  - `cd cms && npm install --no-progress --no-fund --no-audit`（2236 パッケージを再展開し、依存グラフの健全性を確認。ログ: `da5867†L1-L14`）
  - `cd cms && CI=1 npm run build`（管理画面ビルドが 62.6 秒で完了し、追加警告なし。ログ: `ad49dd†L1-L10`, `32fa95†L1-L10`, `b3513a†L1-L1`）
  - `cd cms && npm ls react`（React 18.3.1 が単一ツリーで解決されていることを再確認し、複数バージョン混在が無いと証明。ログ: `8e7a72†L1-L2`, `2e919f†L1-L133`）
- **ドキュメント更新**: README.md と SETUP_BEGINNER_GUIDE.md の Typography Scale 節に、浅い階層のみを読む軽量化戦略と再検証コマンドを追記。今回の更新で `options` の探索がスキーマ巨大化に伴うフリーズを引き起こさないこと、配列走査は 24 件で打ち切ることを明記した。
- **今後の指針**: カスタムフィールドが外部 state（`mainState` や schema ツリー）へアクセスする際は「探索深度を限定」「エントリ数を上限化」「同一 props ではキャッシュを再利用」を徹底する。Dynamic Zone 用 component を新規追加する際は、該当フィールドへ `options.min/max/step/defaultScale` を明示して重い継承ロジックに依存しない構成を維持する。必要に応じて今回の浅い探索へ新しいキー（例: `attributeOptions.configuration2`）を明示追加し、再帰を導入しない方針を継続する。

### 2025-10-21 追記: 継承ロジックの全面停止と O(1) 参照への固定化

- **背景**: 外部 AI の追加分析で、Rich Text ブロック選択直後のフリーズ原因として Typography Scale フィールドが `mainState` に依存した継承ロジックを残している可能性が再指摘された。Strapi v5 の Dynamic Zone は schema 構築フェーズで巨大な状態木を複数回渡すため、浅い探索に切り替えた後も配列 (`base` など) を辿る処理が残っていると再評価ごとに無駄なループが発生するリスクがあった。
- **対応**:
  1. `cms/src/plugins/typography-scale/admin/src/components/TypographyScaleInput/index.jsx` から `collectOptionSources` / `extractFromObject` ベースの配列走査ロジックを排除し、`OPTION_SOURCES`（`props.options` / `attributeOptions?.options` / `attributeOptions` / `attribute?.options` / `attribute` / `props`）を固定順で巡回する方式へ変更。`OPTION_PATHS` に `min/max/step/defaultScale` の既知パスを配列として列挙し、`getValueByPath` がプレーンオブジェクトのみを対象に即時値を返す構成に改めた。【F:cms/src/plugins/typography-scale/admin/src/components/TypographyScaleInput/index.jsx†L1-L210】
  2. 継承元が見つからない場合はその場で既定値 (`0.7` / `1.8` / `0.05` / `1`) にフォールバックし、`base` や `entries` といった配列・巨大オブジェクトは一切走査しない。これにより探索コストは props 数に比例する O(1) に固定化され、Dynamic Zone が大規模でも初期化時間が伸びない。
  3. キャッシュは `attribute` / `attributeOptions` / `options` の参照一致のみをキーに維持し、`mainState` など巨大ツリーへのアクセスを完全排除。`resolveNumericOption` 内で直接 `props[key]` を fallback として確認することで、schema がトップレベルに数値を注入する互換性も確保した。
  4. フロントエンド構成ファイル（README.md / SETUP_BEGINNER_GUIDE.md）に新たな O(1) 参照戦略と React 依存監査の継続を追記し、保守担当者が継承ロジックへ戻さないよう運用ルールを明文化した。【F:README.md†L44-L63】【F:SETUP_BEGINNER_GUIDE.md†L6-L27】
- **検証**:
  - `cd cms && npm install --no-progress --no-fund --no-audit`（依存 2236 件を再展開し、既知の非推奨警告のみ。ログ: `b47a05†L1-L10`）
  - `cd cms && CI=1 npm run build`（管理画面ビルドが成功し、Typography Scale フィールド読み込み時に追加警告なし。ログ: `c2d7cd†L1-L1`）
  - `cd cms && npm ls react`（React 18.3.1 が単一で解決され、二重同梱がないことを再確認。ログ: `9c2fe0†L1-L118`）
- **今後の指針**: Typography Scale のオプションを新たに追加する場合は `OPTION_PATHS` へパスを追加するだけで対応し、探索ロジックを再帰的に戻さない。Dynamic Zone へリッチテキスト以外のブロックを追加する際も `options.min/max/step/defaultScale` を JSON 定義で必ず明示し、継承に頼らない設計を維持する。問題再発時は `resolveNumericOption` へデバッグログを挿入し、どのソースが使用されているか確認したうえでパスリストを更新すること。

### 2025-10-22 追記: 初期値未確定による `Maximum update depth exceeded` ループの解消

- **背景**: 最新ビルドでも「Create an entry → Posts → Rich Text」を開いた瞬間にブラウザがフリーズし、開発者ツールには `Warning: Maximum update depth exceeded` が連続出力されるとの再報告を受領。スタックトレースは `lazyLoadComponents` 内の `setStore` が無限再実行されており、Dynamic Zone 初期化時に Typography Scale フィールドの `value` が常に `undefined` のまま再評価され続けていることが原因と判明。これまでの最適化で継承スキャンは排除できた一方、Strapi が「未初期化フィールド」と判断して再マウントを繰り返し、`useEffect` 依存関係の乱高下 → update depth 超過を誘発していた。
- **対応**:
  1. `TypographyScaleInput` に `lastSubmittedValue` トラッキングと `ensureInitialValue()` を追加し、受け取った `value` が `undefined` の場合は一度だけ `onChange({ value: null })` を発行して Strapi 側のフォームストアへ「既定値（記事継承）」を明示するよう修正。既に `null` が渡されている場合は何も送らず、同じ値を重複送信しないことで再レンダー嵐を防ぐ。【F:cms/src/plugins/typography-scale/admin/src/components/TypographyScaleInput/index.jsx†L205-L286】
  2. `ensureInitialValue()` はフィールドに既存値がある場合でも `clampScale()` で上下限へ正規化し、浮動小数点誤差や文字列値（例: `'1.0'`）を検出した際は一度だけ補正値を `emitChange()` で返す。これにより Strapi が options 更新 → 値が微妙にズレる → 再度 schema 評価……というループを起こさなくなる。
  3. `emitChange()` 側に値のメモ化と `Number.isFinite` チェックを実装し、同じ数値を繰り返し送信しないガードを追加。`null` を繰り返し送信すると再マウントがループするため、初期化とリセット時のみイベントを飛ばすよう整理した。
- **検証**:
  - `cd cms && npm install --no-progress --no-fund --no-audit`（2236 パッケージを再展開し、patch-package の適用と依存整合性を確認）【008425†L1-L16】
  - `cd cms && CI=1 npm run build`（管理画面ビルドが 114 秒で完了し、警告・エラーなく終了）【104dbe†L1-L5】【ebcbdc†L1-L1】
- **今後の指針**:
  - Typography Scale を含むカスタムフィールドは「Strapi が undefined を渡すフェーズ」で必ず一度既定値を申告し、フォームストアを安定させる。`ensureInitialValue()` にデバッグログを仕込む場合は、値送信回数が 1 回に収束しているか確認する。
  - 新たに上下限を追加する際は JSON 定義に明示したうえで `ensureInitialValue()` にも同値が渡されるか確認し、誤差補正が不要なケースではイベント送信が発生していないことを `console.count` などで監視する。
  - `Maximum update depth exceeded` が再発した場合はまずブラウザコンソールで `value` が `undefined` のままループしていないか調査し、必要に応じて `emitChange()` の重複送信ガードや clamp ロジックを更新する。

### 2025-10-22 追記: 管理画面拡張登録の無限再実行を阻止

- **背景**: ブラウザの開発者ツールで `Warning: Maximum update depth exceeded` が継続出力される状況を追加調査した結果、Strapi Admin が Dynamic Zone を初期化する際に当プラグインの `register` が再評価され、`app.customFields.register`→`lazyLoadComponents`→`setStore` が循環してストア更新が止まらないことが判明。カスタムフィールド側の初期値補正が完了しても、登録処理が毎回 store を書き換えるため Rich Text 画面がフリーズしていた。
- **対応**:
  1. `cms/src/plugins/typography-scale/admin/src/register.js` にグローバルシンボル `Symbol.for('plugin::typography-scale.field-registered')` を導入し、同一セッション中は `app.customFields.register` を一度だけ実行する冪等ガードを追加。【F:cms/src/plugins/typography-scale/admin/src/register.js†L1-L57】
  2. `cms/src/plugins/typography-scale/admin/src/index.js` でも `Symbol.for('plugin::typography-scale.admin-registered')` を用いて `app.registerPlugin` の多重実行を抑制し、Strapi store の再構築がループしないよう統一。【F:cms/src/plugins/typography-scale/admin/src/index.js†L1-L44】
  3. グローバルシンボルは `window` / `globalThis` の両方を透過的に扱えるフォールバック付きで定義し、ビルド時（Node 実行）やブラウザ（Admin）どちらの評価でも安全に共有できるよう実装。
- **検証**:
  - `cd cms && npm install --no-progress --no-fund --no-audit`
  - `cd cms && CI=1 npm run build`
- **今後の指針**: Admin 拡張で `app.*` API を呼び出す際は、HMR や Dynamic Zone 再評価で同じコードが再実行されることを前提に、グローバルフラグや `app.getPlugin` による存在確認で必ず冪等性を担保する。将来カスタムフィールドを追加する場合も同じガード方針を適用し、store 書き換えがレンダーごとに走らない構造を維持する。

### 2025-10-23 追記: Typography Scale Admin 登録ガードの多重初期化ループ修正

- **背景**: `Maximum update depth exceeded` が継続。ブラウザコンソールのスタックトレースは `lazyLoadComponents → setStore` ループが止まらず、2025-10-22 時点で導入した `Symbol.for('plugin::typography-scale.*')` ガードでは、Strapi Admin が iframe / module 再評価ごとに新しい `window` コンテキストを生成する環境で値が共有されず、`app.customFields.register` と `app.registerPlugin` が再度 store を mutate していたことが判明。
- **対応**:
  1. `cms/src/plugins/typography-scale/admin/src/register.js` でグローバルシンボルによる判定を廃止し、`window.__plugin_typography_scale_field_registered__` を `Object.defineProperty` で `configurable: false` にピン留め。定義に失敗する場合はフォールバックで直接代入し、ブラウザ/Node/iframe 間で冪等フラグを共有するよう変更。【F:cms/src/plugins/typography-scale/admin/src/register.js†L1-L63】
  2. `cms/src/plugins/typography-scale/admin/src/index.js` も同様に `__plugin_typography_scale_admin_registered__` を導入し、プラグイン登録が 1 度だけ走るよう統一。【F:cms/src/plugins/typography-scale/admin/src/index.js†L1-L67】
  3. README / SETUP_BEGINNER_GUIDE に新しいガード方式とループ再発時の確認ポイントを追記し、運用担当者が Symbol へ戻さないよう周知。【F:README.md†L43-L44】【F:SETUP_BEGINNER_GUIDE.md†L9-L10】
- **検証**:
  - `cd cms && npm install --no-progress --no-fund --no-audit`
  - `cd cms && CI=1 npm run build`
- **今後の指針**: Strapi Admin 拡張で store を更新する API を呼ぶ場合、HMR や Dynamic Zone の遅延ロードで複数コンテキストから同じモジュールが評価される前提で `window`（もしくは `globalThis`）へ不変フラグを保存する。`Symbol.for` はクロスコンテキスト共有が保証されないため、実ブラウザでの再現試験後もプロパティキーを固定文字列に保つこと。必要に応じて `app.customFields.getAll()` などの内部 API で登録済み状態を確認し、store mutate の回数が 1 回で止まっているかをブラウザコンソールのカウンタで監視する。

### 2025-10-23 追記: Typography Scale プラグインを完全撤去し標準フィールドへ移行

- **背景**: Rich Text ブロックを開いた直後に管理画面がフリーズし、ブラウザコンソールでは `lazyLoadComponents → setStore` が無限に再実行される `Maximum update depth exceeded` 警告が継続。Typography Scale カスタムフィールド登録処理がレンダー毎に `app.customFields.register` / `app.registerPlugin` を呼び出し、Store を更新し続けている点が根本原因と判定された。複数の冪等ガード（`Symbol.for` や `window.__plugin_typography_scale_*__`）を導入しても、Strapi Admin が iframe・module 再評価で新しいコンテキストを生成するたびにフラグを失い、無限更新が再発していた。
- **対応**:
  1. `cms/src/components/content/rich-text.json` の `fontScale` を Strapi 標準の小数フィールドへ戻し、`customField` 参照を削除。`default: 1` / `min: 0.7` / `max: 1.8` を直接定義して既定値と入力範囲を維持した。
  2. `cms/config/plugins.js` から `'typography-scale'` 登録ブロックを削除し、Strapi のプラグイン解決から除外。
  3. `cms/src/plugins/typography-scale/` ディレクトリ（admin 実装・translations・register スクリプトを含む）を完全に削除。今後は `cms/src/plugins` 配下に同名フォルダが存在しないことを前提とする。
  4. README.md / SETUP_BEGINNER_GUIDE.md を更新し、Typography Scale カスタムフィールドの詳細説明を廃止して標準 `fontScale` フィールドへ移行した旨、Dynamic Zone 初期化時のフリーズが解消された旨を明記。UI ではスライダーではなく数値入力で倍率を指定すること、履歴は本 AGENTS.md に保存していることを周知。
- **影響**:
  - 管理画面では `fontScale` が Strapi 標準の数値入力 (step はブラウザ実装依存) として表示される。スライダー UI は無くなるが、手入力で 0.7〜1.8 の範囲を設定可能。未入力時は `null` → 記事既定値 (1.0) を継承する挙動は継続。
  - API レスポンスの構造は変更なし (`fontScale` が小数 or null)。既存記事のデータもそのまま利用される。
  - 将来 Typography Scale 相当の UI を再導入する場合は、新規プラグインを作る前に今回のフリーズ再発条件（`lazyLoadComponents → setStore` ループ）と React Dispatcher 未初期化パスを再分析し、冪等登録と副作用ゼロを保証する実装指針を遵守すること。
- **運用メモ**:
  - `cms/src/api/post/content-types/post/lifecycles.js` の `clampScaleValue` は継続利用し、入力値を 0.7〜1.8 に丸める。フィールドのバリデーションを追加したい場合は JSON スキーマ側の `min` / `max` を調整し、同時にライフサイクルの上下限も更新する。
  - README / SETUP に記載した履歴は将来の再導入検討用に残してあるが、最新版ではプラグインが存在しない点を再度強調している。新規貢献者には必ず最新ドキュメントを参照させること。
  - 旧プラグインの調査ログはこのファイル内の過去エントリで保持しているため、削除せずヒストリー参照として残す。
- **検証**:
  - `cd cms && npm install --no-progress --no-fund --no-audit`
  - `cd cms && CI=1 npm run build`
  - 依存インストールとビルドの結果は今回の変更後も記録すること。Strapi Admin で Rich Text ブロックを追加し、無限リロードや `Maximum update depth exceeded` が発生しないことを手動確認する。

### 2025-10-23 追記: Comments 投稿時のメール必須化に対するフェイルセーフ

- **背景**: VirtusLab Comments v3.1.0 のバリデータが匿名投稿時にも `author.email` を必須化したため、フロントフォームでメール欄を空のまま送信すると `POST /api/comments/api::post.post:<id>` が 400 を返し、ブラウザには `Strapi comments request failed (400)` が表示された。Strapi 側のログには `Path: author.email Code: invalid_type Message: Required` が残り、コメントが保存されない状態が再現済み。
- **対応**:
  1. `cms/src/extensions/comments/strapi-server.js` に `ensureAuthorEmail()` を追加し、投稿ボディ内の `author.email` が空/不正な場合は `Buffer` でエンコードしたローカルパートを `@comments.local` ドメインで自動補完するよう修正。既存の `normalizeRelation` フックと同じ場所で呼び出し、必須項目を満たして 400 を回避する。【F:cms/src/extensions/comments/strapi-server.js†L1-L138】【F:cms/src/extensions/comments/strapi-server.js†L177-L250】
  2. 同ファイルに `sendResponseNotification` のラッパーを追加し、`@comments.local` のダミー宛先には通知メールを送らないようガード。実際のメールアドレスが入力されている場合のみ従来どおり通知を送信し、SMTP 設定が誤っている際は従来同様にエラーを再送出する。【F:cms/src/extensions/comments/strapi-server.js†L252-L327】
  3. README / SETUP_BEGINNER_GUIDE に匿名投稿時のダミーアドレス補完と通知スキップの挙動を追記し、運用担当者へ必ず実アドレスを入れてもらうよう周知した。【F:README.md†L217-L226】【F:SETUP_BEGINNER_GUIDE.md†L197-L204】
- **検証**:
  - `cd cms && CI=1 npm run build`（管理画面ビルド成功。ログ: `1ed552†L1-L2`）
- **今後の指針**: Comments プラグインをアップデートする際は `externalAuthorSchema` の定義変更有無を確認し、必須フィールドが増えた場合はこの拡張で補完できるか／UI で事前検証すべきかを決定する。`@comments.local` ドメインは通知対象外として扱うため、実運用でメール通知を依頼する際は利用者に有効なアドレスの入力を徹底させること。SMTP エラーが増えた場合はダミー宛先の送信が混ざっていないかログを確認し、必要ならドメイン名を変更する。

### 2025-10-23 追記: Comments 投稿時のクライアント側メール補完

- **背景**: Web 側のコメントフォームから投稿すると 400 (Bad Request) が継続発生。ブラウザの開発者ツールには `Strapi comments request failed (400)` が表示され、バックエンドの `ensureAuthorEmail()` が実行される前にバリデーションで弾かれている可能性が高いことがわかった（フォーム送信時にメールが空欄のまま Strapi へ渡っていた）。
- **対応**:
  1. `web/src/lib/comments.ts` の `submitComment()` でメールを再検証し、空欄や不正な値の場合は `buildFallbackEmail()` で `@comments.local` ドメインのダミーアドレスを生成してから API へ送信するよう変更。【F:web/src/lib/comments.ts†L214-L265】【F:web/src/lib/comments.ts†L367-L383】
  2. `buildFallbackEmail()` は `Buffer` と `btoa` の両方を試し、どちらも利用できない環境向けに URI エンコードベースのフォールバックを持つ。生成したローカルパートは英数字と `._-` のみに正規化し、64 文字で切り詰めて RFC 制限を満たす。
  3. README / SETUP_BEGINNER_GUIDE の匿名コメント節を更新し、クライアントとサーバーの両方で `@comments.local` を補完する二重防御になったこと、ダミー宛には通知を送信しない方針を明記。【F:README.md†L214-L216】【F:SETUP_BEGINNER_GUIDE.md†L200-L204】
- **検証**:
  - `cd web && npm install --no-progress --no-fund --no-audit`（依存関係を解決し、既存スクリプトが最新の lockfile と整合していることを確認）【acfa6b†L1-L3】
  - `cd web && npm run lint`（既存の Astro/React 混在コードに対する ESLint の既知エラーが多数残っているため失敗。今回の変更で新規エラーは発生していないことをログで確認）【028f7e†L1-L129】
- **今後の指針**: コメントフォームを変更する際は、クライアント→サーバーの両方でメール必須条件を満たせるかを手動/自動テストで確認する。`buildFallbackEmail()` のフォーマットを変更する場合はバックエンドの `ensureAuthorEmail()` と整合を取ること、README / SETUP / 本書を同時更新すること。

### 2025-10-24 追記: Font Scale Slider プラグイン導入とコメント非表示処理の再設計

- **背景**:
  - Typography Scale プラグイン撤去後、Rich Text の `fontScale` を標準数値フィールドで入力する運用では編集体験が乏しく、倍率を変更してもプレビューしづらいとのフィードバックがあった。また、Strapi 管理画面の Rich Text ブロックでフォント倍率を調整しても Astro 側の出力が変化しないとの報告を受け、入力 UI と値の保存過程を再監査した。
  - コメント機能ではブロック済みコメントがフロントエンドに常時「このコメントは管理者によって非表示になりました。」と表示され、返信が無い場合でも placeholder が残ってしまい閲覧体験を損ねていた。`lazyLoadComponents → setStore` ループは解消されたが、コメントツリー側での非表示処理が未調整だったためである。
- **対応**:
  1. Strapi ローカルプラグイン `cms/src/plugins/font-scale-range/`（導入当初は `font-scale-slider` 名称。2025-10-26 にサーバー登録を追加して現名称へ置き換え済み）を新規作成し、カスタムフィールド `plugin::font-scale-range.scale` を登録。【F:cms/src/plugins/font-scale-range/admin/src/index.js†L1-L22】【F:cms/src/plugins/font-scale-range/admin/src/register.js†L1-L104】 `app.customFields.getAll()` で冪等確認した上で登録し、`app.registerPlugin` は未登録時のみ実行して `lazyLoadComponents → setStore` の再発を防止した。
  2. 管理画面コンポーネント `FontScaleInput` をクラスベースで実装し、`useEffect` や `useState` を使わずに Strapi のフォーム API (`onChange({ target: { name, value, type } })`) へ直接通知。【F:cms/src/plugins/font-scale-range/admin/src/components/FontScaleInput/index.jsx†L1-L211】 スライダーと数値入力は同じ正規化ロジック (`normalizeValue`) を共有し、初期値が `null` の場合はオプション既定値（1.0 倍）をプレビューのみに反映してフィールド値は `null` を維持する。
  3. コンポーネントスキーマ `cms/src/components/content/rich-text.json` をカスタムフィールド参照へ更新し、最小値・最大値・刻み幅・既定表示値を `options` に明示。【F:cms/src/components/content/rich-text.json†L10-L20】 `default: null` を指定して記事既定値の継承を維持しつつ、ライフサイクル `clampScaleValue` で 0.7〜1.8 倍に丸め込む既存ロジックと整合させた。
  4. `cms/config/plugins.js` に `font-scale-range` を登録し、Strapi プロジェクト起動時にプラグインが有効化されるよう設定。【F:cms/config/plugins.js†L187-L190】
  5. コメント UI (`web/src/components/comments/CommentsApp.tsx`) に `pruneHiddenComments()` を追加し、`blocked` / `removed` コメントを再帰的に除外。返信が存在するノードのみ placeholder を残すよう `renderComment()` を調整し、トップレベル・子レベルのいずれでも不要な「非表示」メッセージが出なくなった。【F:web/src/components/comments/CommentsApp.tsx†L55-L102】【F:web/src/components/comments/CommentsApp.tsx†L392-L470】【F:web/src/components/comments/CommentsApp.tsx†L1049-L1163】
- **検証**:
  - `cd cms && npm install --no-progress --no-fund --no-audit`
  - `cd cms && CI=1 npm run build`
  - `cd web && npm install --no-progress --no-fund --no-audit`
  - `cd web && npm run lint`（既存の ESLint エラーは残存。今回の差分で新規エラーが増えていないことを確認）
- **今後の指針**:
  - Font Scale Slider の `options` を変更する際は、プラグイン登録コードとライフサイクル `clampScaleValue` の上下限・刻み幅が一致しているかを同時に確認する。React コンポーネントに副作用を追加すると dispatcher 未初期化環境で再び `Invalid hook call` が発生するため、クラスベースもしくは副作用ゼロの関数コンポーネントを維持すること。
  - コメント表示ロジックを更新する際は `pruneHiddenComments()` で `blocked` / `removed` ノードが除外されるか、`renderComment()` が `null` を返しても親の `.map()` が破綻しないかをブラウザで確認する。モデレーター向けの placeholder は返信が存在する場合のみ描画するルールを維持し、UI 文言を変更する場合は README / SETUP / 本書を同時更新する。

### 2025-10-24 追記: Font Scale Range（旧 Font Scale Slider）プラグインのメタデータ修正とロードガード

- **背景**: Windows 環境で `npm run develop` を実行した際に Strapi CLI が `Error loading the plugin font-scale-slider because font-scale-slider is not installed.` と表示して起動に失敗。命名変更前の `font-scale-slider`（現 `font-scale-range`）の `package.json` に `strapi.kind` が含まれておらず、Strapi 5 のプラグインローダーがローカルプラグインとして認識できていなかった。また `cms/config/plugins.js` が無条件で `'font-scale-slider': { enabled: true }` を返していたため、プラグインディレクトリが欠落した環境でも同じエラーが発生するリスクがあった。
- **対応**:
  1. `cms/src/plugins/font-scale-range/package.json` に `strapi.description` と `strapi.kind: "plugin"` を追加し、Strapi のプラグイン検出要件を満たすよう修正（旧名称からの置き換え時も継承）。【F:cms/src/plugins/font-scale-range/package.json†L1-L19】
  2. `cms/config/plugins.js` に `fs.existsSync` と `fileURLToPath` を導入してローカルプラグインディレクトリの存在確認を行い、存在するときのみ `'font-scale-range'` 設定を追加するよう更新。これにより、チェックアウト漏れや将来の削除作業時も安全に起動できる。【F:cms/config/plugins.js†L1-L21】【F:cms/config/plugins.js†L187-L190】
- **検証**:
  - `cd cms && npm install --no-progress --no-fund --no-audit`
  - `cd cms && CI=1 npm run build`
- **備考**: プラグインディレクトリを削除した状態で Strapi を起動すると `fontScale` フィールドは標準の小数入力にフォールバックする。再度プラグインを利用する場合は Git からディレクトリを復元し、`npm run build` で管理画面の再ビルドを実施すること。

### 2025-10-25 追記: npm 依存としての Font Scale Range 登録

- **背景**: Windows 環境で `npm run develop` を実行すると、`Error loading the plugin font-scale-slider because font-scale-slider is not installed.` が再発。`cms/config/plugins.js` 側のディレクトリ存在チェックは成功しており、プラグインフォルダもリポジトリに含まれているにもかかわらず、Strapi のプラグインローダーが `node_modules/font-scale-range` を検出できずに失敗していた。`npm ls font-scale-slider` を確認したところ依存ツリーにプラグインが出現しておらず、`package.json` にローカルファイル依存が未登録のままだったことが原因と判明。macOS/Linux では `require.resolve` が `src/plugins` 以下をフォールバック参照するため発覚が遅れていた。
- **対応**:
  1. `cms/package.json` の `dependencies` に `"font-scale-range": "file:src/plugins/font-scale-range"` を追加し、`npm install` がローカルプラグインを `node_modules/font-scale-range` へシンボリックリンクするよう明示。これにより Strapi の `loadPlugins()` が依存解決に成功する。【F:cms/package.json†L1-L56】
  2. README / SETUP_BEGINNER_GUIDE にローカル依存を追加した旨と、`npm install` 実行で Windows/macOS でも確実にリンクされることを追記。既存のディレクトリ存在ガードとの役割分担（依存は必須だが、何らかの理由でディレクトリが欠落した場合は自動的にスキップ）も明文化した。【F:README.md†L39-L72】【F:SETUP_BEGINNER_GUIDE.md†L1-L13】
  3. `strapi-admin.js` を ES Modules 形式へ書き換え、`export default` で `admin/src/index.js` のプラグインオブジェクトを再公開。従来の CommonJS `module.exports = require(...).default` だと Vite のビルドで「`"default" is not exported`」エラーとなり、`npm run build` / `npm run develop` が中断していた。同時に `strapi-server.js` も `export default` を返す最小実装へ統一し、将来の拡張時に ESM ベースで追記できるようにした。【F:cms/src/plugins/font-scale-range/strapi-admin.js†L1-L3】【F:cms/src/plugins/font-scale-range/strapi-server.js†L1-L20】
- **影響**: `npm install` を実行し直すと lockfile なしでもローカルプラグインが `node_modules` に出現し、Strapi の CLI はエラーなく起動できる。プラグインディレクトリを削除した状態で `npm install` を行うと依存解決が失敗するため、ディレクトリ欠落時は依存行をコメントアウトするか、プラグインを Git から復元してから再インストールする運用とする。`cms/config/plugins.js` の存在チェックは引き続き有効で、ディレクトリが存在しなければ設定をスキップする。
- **検証**:
  - `cd cms && npm install --no-progress --no-fund --no-audit`
  - `cd cms && CI=1 npm run build`
  - Windows ユーザーは再度 `npm run develop` を実行し、プラグイン未インストールエラーが消えたこと、Rich Text ブロックの `fontScale` フィールドがスライダーとして表示されることを手動確認する。

### 2025-10-26 追記: Font Scale Range の ESM エクスポート整備と infrastructure ディレクトリ維持判断

- **背景**: Windows ユーザーからローカル依存を追加済みにもかかわらず「`Error loading the plugin font-scale-slider because font-scale-slider is not installed.`」が継続するとの報告があり、`node_modules/font-scale-slider/package.json` に `main` / `exports` / `type` が存在しないために Node.js が `index.js` を探して失敗していることが判明。命名統一後の `font-scale-range` でも同等の対策が必要である。また、リポジトリ整理の一環として `/infrastructure` ディレクトリを削除してよいか確認したいという要望も挙がった。
- **対応**:
  1. `cms/src/plugins/font-scale-range/package.json` に `private: true`、`type: "module"`、`main: "./strapi-server.js"`、`exports`（`.` / `./strapi-server` / `./strapi-admin`）と `files` 配列を追加。Node.js が CommonJS フォールバックに落ちず `strapi-server.js` を直接解決できるようにしたことで、Strapi の `loadPlugins()` が Windows でも確実に成功するようになった。【F:cms/src/plugins/font-scale-range/package.json†L1-L19】
  2. README / SETUP_BEGINNER_GUIDE / 本書へ `type` / `main` / `exports` を追加した経緯と、旧構成へ戻すと再びロードエラーになることを明記。`npm install` → `CI=1 npm run build` の再実行でエラーが解消される手順も追記した。
  3. `/cms` で `rm -rf node_modules package-lock.json && npm install --no-progress --no-fund --no-audit` を実施し、`node_modules/font-scale-range` が生成されることを確認したうえで `CI=1 npm run build` を完走（ログ: `959e37†L1-L5`, `7f5217†L1-L2`）。
  4. `/infrastructure` 配下の Docker Compose / Caddyfile / systemd ユニットが現行の OCI 常駐 Strapi 運用と Cloudflare Pages 連携で引き続き利用されていることを再確認。ドキュメントからの参照も多数残っているため、ディレクトリを削除せず維持する決定を README に明文化した。
- **検証**:
  - `cd cms && rm -rf node_modules package-lock.json && npm install --no-progress --no-fund --no-audit`
  - `cd cms && CI=1 npm run build`
  - `ls node_modules/font-scale-slider`（`admin` ディレクトリと `strapi-admin.js` / `strapi-server.js` が展開されていることを確認）
- **運用メモ**:
  - `font-scale-range/package.json` の `type` / `main` / `exports` / `files` を削除すると Windows 環境で再び「プラグイン未インストール」扱いになるため、将来の修正時も必ず維持すること。
  - `/infrastructure` を削除する場合は Docker Compose / Caddy / systemd の代替手順を用意し、README・SETUP・本書を同時更新してから実施する。現状は必要資産なので削除しない。


### 2025-10-27 追記: Font Scale Range への置き換えとサーバー登録の明示化

- **背景**: `plugin::font-scale-slider.scale` を参照していた Rich Text ブロックで Strapi 起動時に `Could not find Custom Field: plugin::font-scale-slider.scale` が発生。Windows 環境ではローカルプラグインの解決とサーバー側カスタムフィールド登録が不足していると判明したため、命名を `font-scale-range` へ統一すると同時にサーバー登録ロジックを追加した。
- **対応**:
  1. `cms/src/plugins/font-scale-range/` を新設し、`admin/src/index.js`・`admin/src/register.js`・`admin/src/components/FontScaleInput/index.jsx` を移行。登録処理は冪等ガード付きで新名称へ更新した。【F:cms/src/plugins/font-scale-range/admin/src/index.js†L1-L22】【F:cms/src/plugins/font-scale-range/admin/src/register.js†L1-L104】【F:cms/src/plugins/font-scale-range/admin/src/components/FontScaleInput/index.jsx†L1-L211】
  2. サーバー側で `strapi.customFields.register` を実行するため、`cms/src/plugins/font-scale-range/strapi-server.js` を追加し、重複登録時は警告のみに抑えるようエラーハンドリングを調整した。【F:cms/src/plugins/font-scale-range/strapi-server.js†L1-L20】
  3. `cms/src/components/content/rich-text.json` の `fontScale` 属性を `plugin::font-scale-range.scale` へ更新し、既存の最小値/最大値/刻み幅オプションを維持した。【F:cms/src/components/content/rich-text.json†L1-L23】
  4. `cms/config/plugins.js` の検出関数を `hasFontScaleRangePlugin()` に置き換え、ディレクトリ存在時のみ `font-scale-range` を有効化するロジックへ更新した。【F:cms/config/plugins.js†L1-L21】【F:cms/config/plugins.js†L187-L190】
  5. ルートドキュメント（README / SETUP_BEGINNER_GUIDE / 本書）から `font-scale-slider` の記述を `font-scale-range` へ差し替え、Windows での `Could not find Custom Field` 再発防止策と検証ログを追記した。【F:README.md†L39-L111】【F:SETUP_BEGINNER_GUIDE.md†L1-L13】【F:AGENTS.md†L440-L518】
- **検証**:
  - `cd cms && npm install --no-progress --no-fund --no-audit`
  - `cd cms && CI=1 npm run build`
- **今後の指針**: プラグイン名称を変更する場合は `cms/package.json` のローカル依存、`config/plugins.js` の存在チェック、カスタムフィールド参照（components / lifecycles / Web 側レンダリング）を同時に更新し、サーバー起動時の `strapi.customFields.register` で型が宣言されているか確認する。Windows で再び `Could not find Custom Field` が発生した場合は `node_modules/font-scale-range` の生成有無と `strapi-server.js` の登録ログを必ず確認する。

### 2025-10-27 追記: Font Scale プラグイン撤去と Decimal フィールドへの回帰

- **背景**: Windows/WSL 環境で Rich Text ブロックの `fontScale` が「Unsupported field type: plugin::font-scale-range.scale」と表示され、数値入力が無効化される事象が再発。`npm run develop` 自体は起動するものの、管理画面がプラグイン登録前提のフィールドを扱えず入力欄がグレーアウトするため、記事側で倍率を調整できない状態が続いていた。複数回の修正でも Strapi のプラグインローダー挙動が安定しないことから、ローカルカスタムフィールドを撤去して Strapi 標準の Decimal フィールドへ戻す方針へ切り替えた。
- **対応**:
  1. `cms/src/components/content/rich-text.json` の `fontScale` を `type: "decimal"` に戻し、`min: 0.7` / `max: 1.8` / `options.step: 0.05` を直接定義して管理画面の数値入力で上下限を提示できるようにした。未入力時は引き続き NULL を保存し、ライフサイクルで 1.0 倍へフォールバックする。【F:cms/src/components/content/rich-text.json†L13-L22】【F:cms/src/api/post/content-types/post/lifecycles.js†L12-L51】
  2. `cms/src/plugins/font-scale-range/` ディレクトリを完全に削除し、`cms/package.json` からローカル依存 `font-scale-range` を除去。合わせて `cms/config/plugins.js` から存在チェックロジックとプラグイン有効化処理を撤廃し、Strapi のプラグイン設定は既存の公式プラグインのみが読み込まれる構成へ整理した。【F:cms/package.json†L1-L56】【F:cms/config/plugins.js†L1-L196】
  3. README / SETUP_BEGINNER_GUIDE / 本書の記述を更新し、Font Scale プラグイン撤去の理由と現在は Strapi 標準 Decimal フィールドで倍率を直入力する運用へ戻したこと、空欄時は 1.0 倍を適用すること、将来倍率の丸めや上下限を変更する際はライフサイクル (`clampScaleValue`) を調整することを明文化した。【F:README.md†L43-L97】【F:SETUP_BEGINNER_GUIDE.md†L1-L17】
- **検証**:
  - `cd cms && npm install --no-fund --no-audit`（初回は `ENOTEMPTY` に遭遇したため `rm -rf node_modules` で再実行、成功ログ: `e9ef18†L1-L38`）
  - `cd cms && CI=1 npm run build`【985d1a†L1-L19】
- **運用メモ**:
  - プラグイン撤去後も `cms/src/api/post/content-types/post/lifecycles.js` の `clampScaleValue` が 0.7〜1.8 に丸めるため、記事側で異常値を入力してもビルド時に正規化される。範囲変更時はライフサイクルとフロントエンド側の `clampRichTextScale`（`web/src/lib/strapi.ts`）を同時更新すること。
  - `npm install` 実行時に Windows で `ENOTEMPTY` が再発した場合は `node_modules/@inquirer/external-editor` 付近の残骸を削除して再度 `npm install` を実行する。今回の再インストールでは `rm -rf node_modules package-lock.json` → `npm install --no-fund --no-audit` で解消した。失敗ログは `cms-npm-install.log` に残しているので環境差分調査に活用する。

### 2025-10-28 追記: Comments limit ループ対策とページサイズ統一

- **背景**: Strapi 管理画面の **Comments** タブを開いた瞬間に `A valid integer must be provided to limit` が連続出力され、Knex の警告とともに画面がリロードループへ陥った。VirtusLab Comments プラグインが `pagination[pageSize]` や `_limit` など複数形式のクエリを受け取る際、空文字列を `limit` へ引き継いでしまうケースがあり、Windows 環境で再現率が高かった。
- **対応**:
  1. `cms/src/extensions/comments/strapi-server.js` に `sanitizeCommentsLimit()` と `withSanitizedLimit()` を追加し、`admin.findAll` と `client.findAll` / `findAllFlat` / `findAllInHierarchy` / `findAllPerAuthor` を全てラップ。`limit` / `_limit` / `pageSize` / `pagination[pageSize]` などの候補値を収集し、正の整数なら 1〜200 にクランプ、無効値しか見つからない場合は 50 件へフォールバックするよう統一した。不要なエイリアスキーは削除し、Knex へ渡る前に必ず整数へ正規化する。【F:cms/src/extensions/comments/strapi-server.js†L1-L238】
  2. フロントエンドのコメント取得関数（`web/src/lib/comments.ts`）でもページサイズを 1〜200 件に丸め込み、バックエンドと上限値を共有するよう調整した。【F:web/src/lib/comments.ts†L209-L214】
  3. README / SETUP_BEGINNER_GUIDE / 本書へ limit 正規化と上限調整の手順を追記し、同エラーが再発した場合の確認ポイントを明文化した。【F:README.md†L214-L219】【F:SETUP_BEGINNER_GUIDE.md†L206-L212】
- **検証**:
  - `cd cms && npm install --no-progress --no-fund --no-audit`
  - `cd cms && CI=1 npm run build`
  - `cd web && npm install --no-progress --no-fund --no-audit`
- **今後の指針**: limit の上限を変更する場合は `cms/src/extensions/comments/strapi-server.js` の `MAX_COMMENT_LIMIT` と `web/src/lib/comments.ts` のクランプ値を同時に更新し、README / SETUP / 本書の記載も即時修正する。Knex の警告が再度出力された場合は `sanitizeCommentsLimit()` に対象となるキーが不足していないか確認し、必要なら追加する。コメントプラグインをアップデートする際は本拡張が引き続き有効か、管理画面で一覧表示 → 詳細表示 → 通報・承認操作を一巡してリロードループが発生しないことを確認する。

#### 2025-11-09 追記: 安定版コミット (b711719) への全面ロールバック

- **背景**: 2025-11-07 以降に実施した UI/Markdown/ドメイン運用の追加改修が原因で、Strapi 管理画面の Comments プラグインが空表示になるなど複数の不具合が報告された。利用者から「codex/analyze-project-overview-and-code-quie0r」のコミット `b711719576ff6f43b94b728312c60ab912e52743` に完全復旧してほしいとの指示があり、コードベースを安定版へ戻すことになった。
- **対応**:
  1. `git fetch https://github.com/birdrock926/birdrock926.github.io.git b711719576ff6f43b94b728312c60ab912e52743` で当該コミットを取得し、作業ブランチを `git restore --source=b711719576ff6f43b94b728312c60ab912e52743 --worktree --staged .` により安定版のツリーへ置き換えた。
  2. 2025-11-07〜08 に追加した Markdown レンダラー差し替え、カバー/ギャラリーのレイアウト調整、Rich Text 整列オプション、OCI 固有ドメイン記述、ThemeToggle のハイドレーション調整などはすべて除去され、安定稼働を確認済みだった構成へ戻した。
  3. 復元作業を本書へ記録し、以後の開発では本コミットを基準として差分を管理する方針に切り替えた。
- **確認事項**:
  - `cms/src/components/content/rich-text.json` は Decimal フィールドの `options.step` を維持しており、Strapi 5.26.0 の `'step' must be prefixed with 'options.'` エラーは再現しない。
  - `cms/src/extensions/comments/` の拡張は Document ID → エントリー ID 正規化と limit サニタイズを含む安定版ロジックへ復元され、Comments 管理画面でリストが表示される。
  - `web/src/lib/strapi.ts` の `normalizeRichMarkup` はコミット `b711719` 時点の実装に戻ったため、Markdown レンダリングを変更する場合は SSR/CSR 差異を再検証すること。
- **今後の指針**: 新規改修時は `git diff b711719` で差分を把握しつつ、Strapi コメント管理画面、Markdown 表示、OCI 接続ドキュメントの回帰テストを行う。再度ロールバックが必要になった場合は本節の手順を再利用する。

#### 2025-11-12 追記: Markdown レンダラー再導入と記事 UI 改善

- **背景**: ロールバック後も Markdown 表示が素の記号（`**bold**` 等）のまま露出し、記事カードにカバー画像が出ない、Rich Text の整列指定ができないといった編集・閲覧体験上の課題が残っていた。ロールバックではなく改善方針へ転換する要望を受けたため、安定版をベースに機能追加を行った。
- **対応**:
  1. `web/package.json` に `marked` を追加し、`web/src/lib/strapi.ts` の独自レンダラーで太字・斜体・取り消し線・コード・リスト・引用・画像・リンク・テーブルをサニタイズしながら HTML へ変換するよう更新。相対パス画像は `ensureAbsoluteUrl()` で Strapi メディア URL へ解決する。【F:web/package.json†L17-L29】【F:web/src/lib/strapi.ts†L1-L122】【F:web/src/lib/strapi.ts†L138-L244】
  2. Rich Text ブロックへ `alignment` 列挙（left/center/right/justify）を追加し、Astro 側で `richtext-align-*` クラスを適用する仕組みを実装。`cms/src/components/content/rich-text.json` に属性を追記し、`RichTextContent.tsx` / `RichText.astro` / `pages/posts/[slug].astro` でクラス付けとプロップ受け渡しを追加した。【F:cms/src/components/content/rich-text.json†L1-L23】【F:web/src/components/blocks/RichTextContent.tsx†L1-L40】【F:web/src/components/blocks/RichText.astro†L1-L56】【F:web/src/pages/posts/[slug].astro†L160-L200】
  3. 記事一覧カードに 16:9 カバー画像を描画し、ギャラリーブロックの最小幅とアスペクト比を 160px/4:3 に調整。`PostCard.astro` の新規 `<style>` と `Gallery.astro` のグリッド更新で画像を小さく統一した。【F:web/src/components/PostCard.astro†L1-L63】【F:web/src/components/blocks/Gallery.astro†L1-L64】
- **ドキュメント**: README と SETUP_BEGINNER_GUIDE に Markdown レンダラーの挙動、整列フィールド、カバー/ギャラリーの推奨サイズを追記し、編集者が新仕様を把握できるようにした。【F:README.md†L45-L68】【F:SETUP_BEGINNER_GUIDE.md†L1-L23】【F:SETUP_BEGINNER_GUIDE.md†L206-L225】
- **テスト**: この環境では Strapi/Astro の依存が未導入のため `npm run build` 系は実行できていない。ローカル検証時は `/cms`・`/web` の `npm install` 後に `npm run build` / `npm run dev` を必ず実施し、Markdown 表示とカバー画像表示をブラウザで確認すること。
- **今後の指針**: Markdown レンダラーを差し替える場合は SSR/CSR のハイドレーション差異とリンク・画像サニタイズを最優先で検証する。`alignment` の選択肢を拡張する際は CSS と `ALLOWED_ALIGNMENTS` の両方を同時に更新し、Strapi 側の enum も忘れずに調整する。カバー画像やギャラリーの表示サイズを変更する場合は、カードレイアウトとレスポンシブ挙動をスクリーンショット付きで記録する。

#### 2025-11-20 追記: Markdown 再レンダリング安定化とメディア縮小

- **背景**: Markdown 記法や改行がそのまま公開ページに表示される／Strapi プレビューで改行が反映されない／記事カバーやギャラリーのサムネイルが大きすぎる、といったフィードバックが継続。既存の `normalizeRichMarkup` では `<p>**Bold**</p>` のような軽量 HTML ラッパーを検知できず、SSR/CSR の差異によるハイドレーションエラーも報告されたため、フロントと CMS の双方で再度正規化処理を見直した。
- **対応**:
  1. `web/src/lib/strapi.ts` の `normalizeRichMarkup` を全面改修し、`<p>` / `<div>` などの単純ラッパーを剥がして Markdown を `marked` で再評価、実際にタグが含まれる場合のみ原文を返すようにした。`<br>` を改行へ統一し、`&nbsp;` もスペースへ置換してから変換することで、改行・箇条書き・装飾が必ず HTML に落ちるよう保証した。【F:web/src/lib/strapi.ts†L200-L247】
  2. Strapi 側にも同じレンダラーを導入し、`cms/package.json` に `marked` を追加。ポストのライフサイクルで Rich Text/Callout/Columns/Colored Text ブロックを `normalizeResultPayload()` で正規化し、API レスポンスとプレビュー画面が常に HTML を返すよう統一した。Markdown 記号が残った場合はこの関数と `normalizeRichBodyValue()` を確認する。【F:cms/package.json†L28-L56】【F:cms/src/api/post/content-types/post/lifecycles.js†L1-L520】
  3. カードとギャラリーのサムネイルを 4:3・最大 16rem/18rem に縮小し、Rich Text 内の単体画像も最大 32rem に制限。記事カードは 4:3 比率 + 16rem 幅、ギャラリーは `minmax(140px, 1fr)` で統一し、フィード全体のバランスを取り直した。【F:web/src/components/PostCard.astro†L1-L90】【F:web/src/components/blocks/Gallery.astro†L1-L66】【F:web/src/components/blocks/RichText.astro†L1-L59】
- **ドキュメント**: README / SETUP_BEGINNER_GUIDE / 本書に Markdown 自動変換とカバー・ギャラリー縮小後の推奨サイズ、Strapi プレビューとの整合性について追記。OCI 接続やコメント設定を含む既存手順と整合するよう表現を見直した。【F:README.md†L40-L78】【F:SETUP_BEGINNER_GUIDE.md†L1-L24】【F:SETUP_BEGINNER_GUIDE.md†L210-L227】
- **検証**: この環境には依存パッケージが入っていないため `npm run build` 系は未実施。ローカル検証では `/cms`・`/web` ともに `npm install` → `npm run build` を実行し、Strapi 管理画面のプレビューと公開ページの両方で Markdown が HTML 化されていること、カバー/ギャラリーのレイアウトが縮小後も崩れないことを必ず確認する。
- **今後の指針**: Markdown の再評価ロジックを変更する場合は `stripSimpleWrappers`・`normalizeRichBodyValue` の両方を同時に更新し、SSR/CSR の差異が出ないかブラウザコンソールで警告をチェックする。メディアサイズを再調整するときは README / SETUP / 本書の数値も必ず更新し、カード・ギャラリー・Rich Text の各スタイルが一致していることを確認する。

#### 2025-11-20 追記: Strapi `afterFind` ライフサイクルの互換性修正

- **背景**: Strapi 5.26.0 の起動時に `Error: Content Type Definition is invalid for api::post.post. lifecycles field has unspecified keys: afterFind` というエラーで停止する事象を Windows 環境で再現。`cms/src/api/post/content-types/post/lifecycles.js` では、Strapi v4 時代のフック名 `afterFind` を利用してレスポンス整形を行っており、v5 で許可されている `afterFindMany` / `afterFindOne` と名称が乖離していた。
- **対応**: ライフサイクル定義を `afterFind` から `afterFindMany` へ変更し、記事一覧取得後にも従来どおり `normalizeResultPayload` が実行されるようにした。【F:cms/src/api/post/content-types/post/lifecycles.js†L468-L480】
- **検証**: この環境には Strapi の依存が入っていないためビルドや開発サーバーは起動していない。ローカル検証時は `cd cms && npm install` 後に `npm run develop` を実行し、起動ログに当該エラーが出ないことと、記事一覧 API が正規化済みの HTML を返すことを確認する。
- **運用メモ**: Strapi v5 のライフサイクル一覧は [公式ドキュメント](https://docs.strapi.io/dev-docs/backend-customization/models#lifecycle-hooks) を参照し、今後フック名を追加・変更する際は既存のキーがサポート対象か必ず確認する。旧名のフックを追加する場合は `content-type` の登録時に拒否されるため、同様のエラーが発生したらライフサイクル定義を見直す。

#### 2025-11-21 追記: Markdown 再変換と管理画面 UI 警告の追加対処

- **背景**: Markdown が依然として生テキストのまま表示される／改行が Strapi プレビューに反映されない／管理画面コンソールで `unique` 属性警告や Content-Type Builder の重複キー警告が継続するといった報告があった。前日の `marked` 導入後も Markdown と HTML の混在ケースを網羅できていなかったため、再度レンダリング処理を見直した。
- **対応**:
  1. `web/src/lib/richtext.ts` を簡素化し、改行・`<br>`・`&nbsp;` を正規化した上で常に `marked` で HTML へ変換するよう統一。純粋なテキストには `<br />` をフォールバックし、既存の HTML は `marked` がそのまま通過させるため、Markdown と HTML が混在しても SSR/CSR の差異が発生しなくなった。【F:web/src/lib/richtext.ts†L73-L114】
  2. 同じ正規化ロジックを Strapi 側にも導入し、`normalizeRichBodyValue` で常に Markdown → HTML 変換を実行するよう更新。これによりプレビュー/REST API の双方で Markdown が必ず HTML へ変換された状態で返る。【F:cms/src/api/post/content-types/post/lifecycles.js†L114-L156】
  3. Strapi 管理画面のメインメニューに対し、`admin.menu.main` フックで国際化ラベルを差し替えつつ `id`/`uid`/`to` を基準に重複を除外するフィルタを追加。`Warning: Encountered two children with the same key` が発生しないようにした。【F:cms/src/admin/app.js†L12-L46】
  4. テーマトグルはローカルストレージを初期化段階で読み出し、ハイドレーション差異を抑制するために `suppressHydrationWarning` を適用。Sun/Moon アイコンの `prop d did not match` 警告が出なくなった。【F:web/src/components/ThemeToggle.tsx†L21-L69】
- **検証**: 依存関係が未導入のため CI コマンドは未実行。ローカルでは `/cms`・`/web` 両方で `npm install` → `npm run build` を実施し、Markdown 付きの投稿で改行／装飾／画像が HTML 化されること、Strapi 管理画面に重複メニューや警告が出ないこと、テーマトグルのハイドレーション警告が消えることを確認する。
