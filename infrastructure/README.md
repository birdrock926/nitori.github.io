# インフラ構成

このディレクトリには OCI Always Free 上で Strapi v5 を稼働させるための Docker Compose とリバースプロキシ設定を格納しています。

## 構成
- `docker-compose.yml` — Strapi + PostgreSQL + Caddy
- `Caddyfile` — HTTPS 終端とリバースプロキシ
- `strapi.service` — systemd から Docker Compose を起動するユニットファイル例

## 利用手順
1. サーバーにリポジトリを配置し、`.env` を `/cms` に設定
2. `docker compose -f infrastructure/docker-compose.yml up -d`
   - 付属の Compose ファイルは `node:20-alpine` ベースのコンテナで `scripts/run-strapi.mjs` を介してビルドと起動を行います。Node 20 + Alpine 環境でも `ERR_UNSUPPORTED_DIR_IMPORT` や `Bus error` が発生しないようパッチ適用済みですが、メモリが 2GB 未満だとビルドが落ちる場合があります。その際は `strapi/strapi:5` をベースにするか、ローカルで `npm run build` 済みの `build/` ディレクトリをマウントする運用に切り替えてください。
3. DNS をサーバーに向け、Caddy の TLS 設定を更新
4. `systemctl enable --now strapi.service` で自動起動を設定

## バックアップ
- データベース: `strapi_db` ボリュームを定期的にバックアップ
- アップロード: `strapi_uploads` ボリュームをオブジェクトストレージへ同期
