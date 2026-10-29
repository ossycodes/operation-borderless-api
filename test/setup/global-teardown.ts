export default async function globalTeardown(): Promise<void> {
  await Promise.all([
    globalThis.__POSTGRES_CONTAINER__?.stop(),
    globalThis.__REDIS_CONTAINER__?.stop(),
  ]);
}
