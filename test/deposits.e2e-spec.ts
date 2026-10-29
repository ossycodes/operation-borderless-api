import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  balanceOf,
  createWallet,
  deposit,
  expectLedgerReconciles,
} from './utils/fixtures';
import { API, createTestApp } from './utils/test-app';

describe('Deposits (e2e)', () => {
  let app: INestApplication<App>;
  let server: ReturnType<INestApplication<App>['getHttpServer']>;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it('credits the wallet immediately and records a transaction', async () => {
    const walletId = await createWallet(server);

    const res = await deposit(server, walletId, 'cNGN', '150000.50');

    expect(res.status).toBe(201);
    expect(res.headers['idempotent-replayed']).toBe('false');
    expect(res.body).toMatchObject({
      id: expect.any(String),
      type: 'DEPOSIT',
      status: 'COMPLETED',
      sourceWalletId: null,
      destinationWalletId: walletId,
      source: null,
      destination: { currency: 'cNGN', amount: '150000.500000' },
      fx: null,
    });
    await expect(balanceOf(server, walletId, 'cNGN')).resolves.toBe(
      '150000.500000',
    );
    await expectLedgerReconciles(app, walletId);
  });

  it('values the wallet in USD after a deposit', async () => {
    const walletId = await createWallet(server);
    await deposit(server, walletId, 'cNGN', '1550').expect(201); // 1 USD (static)
    await deposit(server, walletId, 'EURx', '0.92').expect(201); // 1 USD

    const res = await request(server)
      .get(`${API}/wallets/${walletId}/balances`)
      .expect(200);

    expect(res.body.totalUsd).toBe('2.00');
  });

  describe('idempotency', () => {
    it('replays the original response for a retried key without double-crediting', async () => {
      const walletId = await createWallet(server);
      const key = randomUUID();

      const first = await deposit(server, walletId, 'USDx', '100', key);
      const retry = await deposit(server, walletId, 'USDx', '100', key);

      expect(first.status).toBe(201);
      expect(retry.status).toBe(201);
      expect(retry.headers['idempotent-replayed']).toBe('true');
      expect(retry.body).toEqual(first.body);
      await expect(balanceOf(server, walletId, 'USDx')).resolves.toBe(
        '100.000000',
      );
    });

    it('rejects reusing a key with a different payload', async () => {
      const walletId = await createWallet(server);
      const key = randomUUID();
      await deposit(server, walletId, 'USDx', '100', key).expect(201);

      const res = await deposit(server, walletId, 'USDx', '999', key);

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
      await expect(balanceOf(server, walletId, 'USDx')).resolves.toBe(
        '100.000000',
      );
    });

    it('processes concurrent duplicates exactly once', async () => {
      const walletId = await createWallet(server);
      const key = randomUUID();

      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          deposit(server, walletId, 'cGHS', '25', key),
        ),
      );

      expect(results.every((r) => r.status === 201)).toBe(true);
      expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
      expect(
        results.filter((r) => r.headers['idempotent-replayed'] === 'false'),
      ).toHaveLength(1);
      await expect(balanceOf(server, walletId, 'cGHS')).resolves.toBe(
        '25.000000',
      );
    });

    it('requires an Idempotency-Key header', async () => {
      const walletId = await createWallet(server);
      const res = await request(server)
        .post(`${API}/wallets/${walletId}/deposits`)
        .send({ currency: 'USDx', amount: '10' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    });
  });

  it('applies many concurrent deposits with exact decimal arithmetic', async () => {
    const walletId = await createWallet(server);

    await Promise.all(
      Array.from({ length: 20 }, () =>
        deposit(server, walletId, 'USDx', '0.1').expect(201),
      ),
    );

    await expect(balanceOf(server, walletId, 'USDx')).resolves.toBe('2.000000');
    await expectLedgerReconciles(app, walletId);
  });

  it.each([
    ['zero', { currency: 'USDx', amount: '0' }],
    ['negative', { currency: 'USDx', amount: '-5' }],
    ['too many decimals', { currency: 'USDx', amount: '1.1234567' }],
    ['a JSON number', { currency: 'USDx', amount: 10 }],
    ['exponent notation', { currency: 'USDx', amount: '1e3' }],
    [
      'above the per-operation cap',
      { currency: 'USDx', amount: '1000000000001' },
    ],
    ['an unsupported currency', { currency: 'BTC', amount: '1' }],
  ])('rejects %s', async (_, body) => {
    const walletId = await createWallet(server);
    const res = await request(server)
      .post(`${API}/wallets/${walletId}/deposits`)
      .set('Idempotency-Key', randomUUID())
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 for an unknown wallet', async () => {
    const res = await deposit(server, randomUUID(), 'USDx', '10');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('WALLET_NOT_FOUND');
  });
});
