// Imported first by export-openapi.ts: config validation runs when AppModule
// is loaded, so placeholders must exist before that import. Nothing ever
// connects to them (the app is created in preview mode).
process.env.DATABASE_URL ??=
  'postgres://openapi:openapi@localhost:5432/openapi';
process.env.REDIS_URL ??= 'redis://localhost:6379';
