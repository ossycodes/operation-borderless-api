import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  balanceOf,
  createFundedWallet,
  expectLedgerReconciles,
} from './utils/fixtures';
import { API, createTestApp } from './utils/test-app';

/*
 * Tests run against the static rate table (units per USD):
 * USD 1, EUR 0.92, NGN 1550, GHS 15.5, XAF 603.48044
 */
describe('Swaps (e2e)', () => {
  let app: INestApplication<App>;
  let server: ReturnType<INestApplication<App>['getHttpServer']>;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  const swap = (walletId: string, body: object, key: string = randomUUID()) =>
    request(server)
      .post(`${API}/wallets/${walletId}/swaps`)
      .set('Idempotency-Key', key)
      .send(body);

  it('converts at the current rate and records the rate applied', async () => {
    const walletId = await createFundedWallet(server, { USDx: '100' });

    const res = await swap(walletId, {
      fromCurrency: 'USDx',
      toCurrency: 'cNGN',
      amount: '40',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      type: 'SWAP',
      sourceWalletId: walletId,
      destinationWalletId: walletId,
      source: { currency: 'USDx', amount: '40.000000' },
      destination: { currency: 'cNGN', amount: '62000.000000' },
      fx: {
        rate: '1550.000000000000',
        source: 'static',
        provider: 'static-table',
        refreshedAt: expect.any(String),
      },
    });
    await expect(balanceOf(server, walletId, 'USDx')).resolves.toBe(
      '60.000000',
    );
    await expect(balanceOf(server, walletId, 'cNGN')).resolves.toBe(
      '62000.000000',
    );
    await expectLedgerReconciles(app, walletId);
  });

  it('rounds the bought amount down using the recorded 12 dp rate', async () => {
    const walletId = await createFundedWallet(server, { cNGN: '1000' });

    const res = await swap(walletId, {
      fromCurrency: 'cNGN',
      toCurrency: 'USDx',
      amount: '1000',
    });

    // 1/1550 = 0.000645161290322... -> 0.000645161290 (12 dp, half-even)
    // 1000 * 0.000645161290 = 0.645161290 -> 0.645161 (6 dp, down)
    expect(res.status).toBe(201);
    expect(res.body.fx.rate).toBe('0.000645161290');
    expect(res.body.destination.amount).toBe('0.645161');
  });

  it('converts between two African stablecoins via USD cross rates', async () => {
    const walletId = await createFundedWallet(server, { cGHS: '31' });

    const res = await swap(walletId, {
      fromCurrency: 'cGHS',
      toCurrency: 'cNGN',
      amount: '31',
    });

    expect(res.status).toBe(201);
    expect(res.body.fx.rate).toBe('100.000000000000'); // 1550 / 15.5
    expect(res.body.destination.amount).toBe('3100.000000');
  });

  it('rejects a swap that would make the balance negative', async () => {
    const walletId = await createFundedWallet(server, { USDx: '10' });

    const res = await swap(walletId, {
      fromCurrency: 'USDx',
      toCurrency: 'EURx',
      amount: '10.000001',
    });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({
      code: 'INSUFFICIENT_FUNDS',
      details: {
        walletId,
        currency: 'USDx',
        available: '10.000000',
        requested: '10.000001',
      },
    });
    await expect(balanceOf(server, walletId, 'USDx')).resolves.toBe(
      '10.000000',
    );
    await expect(balanceOf(server, walletId, 'EURx')).resolves.toBe('0.000000');
  });

  it('rejects swapping a currency into itself', async () => {
    const walletId = await createFundedWallet(server, { USDx: '10' });
    const res = await swap(walletId, {
      fromCurrency: 'USDx',
      toCurrency: 'USDx',
      amount: '1',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('SAME_CURRENCY_SWAP');
  });

  it('rejects amounts that convert to less than one micro-unit', async () => {
    const walletId = await createFundedWallet(server, { cNGN: '1' });
    const res = await swap(walletId, {
      fromCurrency: 'cNGN',
      toCurrency: 'USDx',
      amount: '0.000001',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('AMOUNT_TOO_SMALL');
  });

  it('never processes the same swap twice', async () => {
    const walletId = await createFundedWallet(server, { USDx: '100' });
    const key = randomUUID();
    const body = { fromCurrency: 'USDx', toCurrency: 'EURx', amount: '50' };

    const results = await Promise.all(
      Array.from({ length: 5 }, () => swap(walletId, body, key)),
    );

    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    await expect(balanceOf(server, walletId, 'USDx')).resolves.toBe(
      '50.000000',
    );
    await expect(balanceOf(server, walletId, 'EURx')).resolves.toBe(
      '46.000000',
    );
  });

  it('never overdraws under concurrent swaps with different keys', async () => {
    const walletId = await createFundedWallet(server, { USDx: '100' });

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        swap(walletId, {
          fromCurrency: 'USDx',
          toCurrency: 'cGHS',
          amount: '15',
        }),
      ),
    );

    const ok = results.filter((r) => r.status === 201);
    const rejected = results.filter((r) => r.status === 422);
    expect(ok).toHaveLength(6); // 6 x 15 = 90 <= 100
    expect(rejected).toHaveLength(4);
    expect(
      rejected.every((r) => r.body.error.code === 'INSUFFICIENT_FUNDS'),
    ).toBe(true);
    await expect(balanceOf(server, walletId, 'USDx')).resolves.toBe(
      '10.000000',
    );
    await expect(balanceOf(server, walletId, 'cGHS')).resolves.toBe(
      '1395.000000',
    );
    await expectLedgerReconciles(app, walletId);
  });

  it('lets a key be retried after an insufficient-funds failure', async () => {
    const walletId = await createFundedWallet(server, { USDx: '5' });
    const key = randomUUID();
    const body = { fromCurrency: 'USDx', toCurrency: 'cXAF', amount: '10' };

    await swap(walletId, body, key).expect(422);
    await request(server)
      .post(`${API}/wallets/${walletId}/deposits`)
      .set('Idempotency-Key', randomUUID())
      .send({ currency: 'USDx', amount: '5' })
      .expect(201);

    const retry = await swap(walletId, body, key);
    expect(retry.status).toBe(201);
    expect(retry.headers['idempotent-replayed']).toBe('false');
  });
});
