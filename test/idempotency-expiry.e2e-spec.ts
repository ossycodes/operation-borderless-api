import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { IdempotencyService } from '../src/idempotency/idempotency.service';
import { balanceOf, createWallet, deposit } from './utils/fixtures';
import { createTestApp } from './utils/test-app';

describe('Idempotency key expiry (e2e)', () => {
  let app: INestApplication<App>;
  let db: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  /** Simulates the passage of time past the 24 h TTL used in tests. */
  const age = (key: string, hours: number) =>
    db.query(
      `UPDATE idempotency_keys
          SET created_at = now() - make_interval(hours => $2)
        WHERE key = $1`,
      [key, hours],
    );

  const keyExists = async (key: string): Promise<boolean> => {
    const rows: unknown[] = await db.query(
      `SELECT 1 FROM idempotency_keys WHERE key = $1`,
      [key],
    );
    return rows.length > 0;
  };

  it('replays inside the TTL, and treats the key as new once it has expired', async () => {
    const server = app.getHttpServer();
    const walletId = await createWallet(server);
    const key = randomUUID();

    const first = await deposit(server, walletId, 'USDx', '10', key).expect(
      201,
    );
    await age(key, 23);
    const replay = await deposit(server, walletId, 'USDx', '10', key).expect(
      201,
    );
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(replay.body.id).toBe(first.body.id);

    await age(key, 25);
    // A different payload would be 422 IDEMPOTENCY_KEY_REUSED inside the TTL.
    const reused = await deposit(server, walletId, 'USDx', '5', key).expect(
      201,
    );
    expect(reused.headers['idempotent-replayed']).toBe('false');
    expect(reused.body.id).not.toBe(first.body.id);
    expect(await balanceOf(server, walletId, 'USDx')).toBe('15.000000');
  });

  it('purges only expired keys', async () => {
    const server = app.getHttpServer();
    const walletId = await createWallet(server);
    const [expired, fresh] = [randomUUID(), randomUUID()];
    await deposit(server, walletId, 'cNGN', '1', expired).expect(201);
    await deposit(server, walletId, 'cNGN', '1', fresh).expect(201);
    await age(expired, 48);

    const deleted = await app.get(IdempotencyService).purgeExpired(1);

    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(await keyExists(expired)).toBe(false);
    expect(await keyExists(fresh)).toBe(true);
    // The transaction itself is history and is never purged.
    const history: unknown[] = await db.query(
      `SELECT 1 FROM transactions WHERE idempotency_key = $1`,
      [expired],
    );
    expect(history).toHaveLength(1);
  });
});
