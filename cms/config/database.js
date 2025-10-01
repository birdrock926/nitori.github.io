export default ({ env }) => ({
  connection: {
    client: env('DATABASE_CLIENT', 'sqlite'),
    connection:
      env('DATABASE_CLIENT', 'sqlite') === 'sqlite'
        ? {
            filename: env('DATABASE_FILENAME', '.tmp/data.db'),
          }
        : {
            host: env('DATABASE_HOST', '127.0.0.1'),
            port: env.int('DATABASE_PORT', 5432),
            database: env('DATABASE_NAME', 'strapi'),
            user: env('DATABASE_USERNAME', 'strapi'),
            password: env('DATABASE_PASSWORD', 'strapi'),
            schema: env('DATABASE_SCHEMA', 'public'),
            ssl: env.bool('DATABASE_SSL', false)
              ? { rejectUnauthorized: env.bool('DATABASE_SSL_SELF', false) }
              : false,
          },
    pool: env('DATABASE_CLIENT', 'sqlite') === 'sqlite'
      ? {
          min: 0,
          max: 5,
        }
      : {
          min: 2,
          max: 10,
        },
  },
});
