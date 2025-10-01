# プロジェクト概要

## 目的（What & Why）
- **ゲームニュース／配信まとめ**を、**高速・低コスト**かつ**運用しやすい GUI**で継続発信し、**検索流入＋SNS拡散でインプレッションを獲得**。  
- **匿名コメント**を安全に受け付け、**通報・モデレーション・BAN**を一元管理。  
- **Google 広告**と **SEO/ニュース露出**を意識した情報設計で、**収益化の地力**を作る。

## 成果物（Deliverables）
- **公開サイト**：GitHub Pages で配信される**静的サイト**（Astro + React Islands）
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
  - **Dynamic Zone**を React コンポーネントにマップ（RichText / Figure / Gallery / Twitch / YouTube）  
  - **コメント島**だけクライアントで API に接続（最小 JS）
- **CMS（/cms）**：Strapi v5  
  - 記事・タグ・メディア・埋め込み・**匿名コメント/通報/BAN** を GUI で管理  
  - **Webhook** が GitHub Actions を起動し、サイトを再ビルド
- **インフラ**  
  - **OCI Always Free**：Strapi 常駐（Docker Compose）  
  - **GitHub Pages**：本番ホスティング（Actions でビルド＆デプロイ）

## 主要機能
### コンテンツ編集（GUI）
- **WYSIWYG + ブロック構成**（Dynamic Zone）  
- 画像は**ドラッグ＆ドロップ**、自動リサイズ/WebP/AVIF/LQIP  
- **Twitch/YouTube** は ID/URL 入力だけで埋め込み（16:9・lazyload・アクセシブル）  
- **Draft/Publish**、公開予約（publishedAt）、タグ分類、関連記事自動

### 匿名コメント & モデレーション
- **ログイン不要**の投稿/返信（2 階層）  
- **通報→自動非表示**（しきい値）、**シャドウBAN**、**TTL 付き BAN（ip_hash / net_hash）**  
- **レート制限**（分/時/日）＋ **CAPTCHA**（Turnstile/Recaptcha 切替）＋ honeypot/最短送信時間  
- **サニタイズ**・禁止語・URL 本数制限・リンク**ホワイトリスト**（twitch/youtube/自ドメイン等）

### SEO / 収益
- `NewsArticle`/`Article` **JSON-LD**、OGP 自動生成、サイトマップ/RSS  
- **AdSense**：`ads.txt` 雛形・密接配置回避コンポーネント  
- **Consent Mode v2** フック（EEA/UK 対応を将来有効化しやすい構成）

### UI/UX（読者体験）
- テーマ（ライト/ダーク）・読みやすいタイポ・スケルトン/LQIP・アクセシビリティ AA 準拠  
- トップ：ヒーロー＋最新カード＋ライブ配信セクション＋ランキング  
- 記事：目次自動 / 関連記事 / コメント島（控えめ UI）

## データモデル（抜粋）
- **Post**：`title, slug, summary, cover, tags[], blocks(DZ), author, publishedAt`  
- **Comment**：`post, parent, body, alias, status(published|pending|hidden|shadow), ip_hash, edit_key_hash, meta`  
- **Report / Ban**：通報・BAN 管理用  
- **Embed / Media Components**：`TwitchLive, TwitchVod, YouTube, Figure, Gallery, RichText`

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

本リポジトリは Strapi v5 を用いた CMS(`/cms`) と Astro + React Islands を用いたフロントエンド(`/web`) のモノレポです。OCI Always Free 上で稼働する Docker Compose 構成、および GitHub Pages への静的デプロイに対応しています。

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

各パッケージ直下に `.env.sample` を用意しています。必要な値を `.env` に複製し、値を設定してください。

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
Strapi 管理画面初期化後、管理ユーザーを作成し、コンテンツタイプおよび権限が自動で適用されていることを確認します。

## 2. フロントエンド（Astro）
```bash
cd web
cp .env.sample .env
npm install
npm run build
npm run preview
```
`npm run preview` でローカル確認後、GitHub Pages へデプロイします。

---

# 運用ランブック

## Webhook → Pages 自動デプロイ
1. Strapi で記事を Publish / Unpublish
2. Strapi Webhook が GitHub Actions の `workflow_dispatch` を呼び出し
3. Actions が Astro をビルドし、Pages へデプロイ

## コメントモデレーション
- 通報が閾値以上で自動非表示 → モデレータが `published` へ戻すか `shadow` に変更
- BAN 登録で即時拒否（ip_hash / net_hash）。期限付き BAN も可能
- シャドウ BAN 時は投稿者のみ表示され、他のユーザーには表示されません

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
2. DNS を GitHub Pages に向ける（CNAME 設定）
3. GitHub Actions Secrets を設定し、Strapi Webhook からのトリガーを許可
4. 管理画面から記事を Publish し、GitHub Pages が更新されることを確認

---

# トラブルシューティング

- **Strapi が起動しない**：`npm run build -- --clean` を実行し、`node_modules` を削除後再インストール
- **Webhook が失敗する**：Strapi ログと GitHub Actions の `workflow_dispatch` イベントログを確認
- **コメントが投稿できない**：CAPTCHA、BAN、禁止語リスト、URL ホワイトリストの各設定を確認

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

