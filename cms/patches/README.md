# Patch notes

Strapi 管理画面で `require('styled-components')` が関数を返さず「styled is not a function」になる問題を解消するため、
`styled-components@6.1.19` の CommonJS バンドルに互換ラッパーを追加するパッチを適用しています。`module.exports` をデフォルト
エクスポートのファクトリーに差し替え、`styled` ヘルパーと `__esModule` フラグを保持させることで Vite 開発サーバーと本番ビルド
の双方で Strapi が期待する API 形状を確保します。

`strapi-plugin-comments+3.1.0.patch` ではプラグインの Zod バリデーションを緩和し、`author.email` を任意入力として扱えるようにして
います。メアド未入力でも投稿できる一方、提供された場合は Strapi 側で返信通知メールにのみ使用し、API レスポンスからは除外されます
。
