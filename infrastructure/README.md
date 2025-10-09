# インフラ構成

このディレクトリには OCI Always Free 上で Strapi v5 を稼働させるための Docker Compose とリバースプロキシ設定を格納しています。
コメント機能は Strapi 本体に導入した [VirtusLab – Comments プラグイン](https://market.strapi.io/plugins/virtuslab-comments) が提供するため、外部サービス用の追加コンテナは不要です。

## 構成
- `docker-compose.yml` — Strapi + PostgreSQL + Caddy
- `Caddyfile` — HTTPS 終端とリバースプロキシ
- `strapi.service` — systemd から Docker Compose を起動するユニットファイル例

## 利用手順
1. サーバーにリポジトリを配置し、`.env` を `/cms` に設定
2. `docker compose -f infrastructure/docker-compose.yml pull`
3. `docker compose -f infrastructure/docker-compose.yml up -d`
   - 付属の Compose ファイルは `node:20-alpine` ベースのコンテナで `scripts/run-strapi.mjs` を介して Strapi をビルド・起動します。Node
     20 + Alpine 環境でも `ERR_UNSUPPORTED_DIR_IMPORT` や `Bus error` が発生しないようパッチ適用済みですが、メモリが 2GB 未満だとビ
     ルドが落ちる場合があります。その際は `strapi/strapi:5` をベースにするか、ローカルで `npm run build` 済みの `build/` ディレク
     トリをマウントする運用に切り替えてください。
   - Comments プラグインは Strapi 本体に組み込まれており、管理 UI も Strapi 管理画面（`/admin/plugins/comments`）からアクセスします。
     公開 API へコメント投稿を許可するには、Strapi 起動後に管理画面で `Public` ロールに対して `plugin::comments.client-comments.create`
     などの権限を付与してください。
   - `cms/.env` の `COMMENTS_CLIENT_URL` や `COMMENTS_CONTACT_EMAIL` を Strapi 起動前に設定しておくと、プラグインの通知・公開設定が適切に反映されます。
4. DNS をサーバーに向け、Caddy の TLS 設定を更新
5. `systemctl enable --now strapi.service` で自動起動を設定

## バックアップ
- データベース: `strapi_db` ボリュームを定期的にバックアップ
- アップロード: `strapi_uploads` ボリュームをオブジェクトストレージへ同期
- コメント: コメントデータは Strapi のデータベース（`strapi_db`）に保存されるため、DB バックアップに含まれます。
