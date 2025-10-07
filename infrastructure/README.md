# インフラ構成

このディレクトリには OCI Always Free 上で Strapi v5 と Remark42 を稼働させるための Docker Compose とリバースプロキシ設定を格納
しています。

## 構成
- `docker-compose.yml` — Strapi + PostgreSQL + Remark42 + Caddy
- `Caddyfile` — HTTPS 終端とリバースプロキシ
- `strapi.service` — systemd から Docker Compose を起動するユニットファイル例

## 利用手順
1. サーバーにリポジトリを配置し、`.env` を `/cms` に設定
2. `cp remark42.env.sample remark42.env`（初期化用。サンプルは README 参照）
3. `docker compose -f infrastructure/docker-compose.yml up -d`
   - 付属の Compose ファイルは `node:20-alpine` ベースのコンテナで `scripts/run-strapi.mjs` を介して Strapi をビルド・起動します。Node
     20 + Alpine 環境でも `ERR_UNSUPPORTED_DIR_IMPORT` や `Bus error` が発生しないようパッチ適用済みですが、メモリが 2GB 未満だとビ
     ルドが落ちる場合があります。その際は `strapi/strapi:5` をベースにするか、ローカルで `npm run build` 済みの `build/` ディレク
     トリをマウントする運用に切り替えてください。
   - Remark42 コンテナは `remark42.env` の `SITE` / `SECRET` / `ADMIN_PASSWD` を読み込みます。初期値のまま起動すると `http://<host>:8080`
     で動作確認ができ、`http://<host>:8080/web` から管理 GUI にサインインできます。
   - Compose ファイルでは `umputun/remark42:latest` を利用しているため、`docker compose -f infrastructure/docker-compose.yml pull remark42` を実行してから起動すると最新リリースを取得できます。
4. DNS をサーバーに向け、Caddy の TLS 設定を更新
5. `systemctl enable --now strapi.service` で自動起動を設定

## バックアップ
- データベース: `strapi_db` ボリュームを定期的にバックアップ
- アップロード: `strapi_uploads` ボリュームをオブジェクトストレージへ同期
- コメント: `remark42_data` ボリュームを定期的にバックアップ
