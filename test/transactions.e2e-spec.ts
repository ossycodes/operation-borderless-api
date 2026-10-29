import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createWallet, deposit } from './utils/fixtures';
import { API, createTestApp } from './utils/test-app';

describe('Transaction history (e2e)', () => {
  let app: INestApplication<App>;
  let server: ReturnType<INestApplication<App>['getHttpServer']>;
  let alice: string;
  let bob: string;

  const post = (path: string, body: object) =>
    request(server)
      .post(`${API}${path}`)
      .set('Idempotency-Key', randomUUID())
      .send(body)
      .expect(201);

  const history = (walletId: string, query: Record<string, string> = {}) =>
    request(server).get(`${API}/wallets/${walletId}/transactions`).query(query);

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
    alice = await createWallet(server);
    bob = await createWallet(server);

    // Chronological activity for alice (oldest first):
    await deposit(server, alice, 'USDx', '100').expect(201); //    1 deposit USDx
    await deposit(server, alice, 'cNGN', '5000').expect(201); //   2 deposit cNGN
    await post(`/wallets/${alice}/swaps`, {
      fromCurrency: 'USDx',
      toCurrency: 'cGHS',
      amount: '10',
    }); //                                                         3 swap USDx->cGHS
    await post(`/wallets/${alice}/transfers`, {
      destinationWalletId: bob,
      sourceCurrency: 'USDx',
      destinationCurrency: 'EURx',
      amount: '20',
    }); //                                                         4 transfer_out USDx
    await deposit(server, bob, 'cXAF', '1000').expect(201);
    await post(`/wallets/${bob}/transfers`, {
      destinationWalletId: alice,
      sourceCurrency: 'cXAF',
      amount: '500',
    }); //                                                         5 transfer_in cXAF
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists deposits, swaps and transfers sent and received, newest first', async () => {
    const res = await history(alice);

    expect(res.status).toBe(200);
    expect(res.body.data.map((t: { kind: string }) => t.kind)).toEqual([
      'transfer_in',
      'transfer_out',
      'swap',
      'deposit',
      'deposit',
    ]);
    expect(res.body.pageInfo).toEqual({
      limit: 20,
      hasMore: false,
      nextCursor: null,
    });
  });

  it('shows a transfer from the receiver side with the converted amount', async () => {
    const res = await history(bob, { type: 'transfer_in' });

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      kind: 'transfer_in',
      sourceWalletId: alice,
      destinationWalletId: bob,
      source: { currency: 'USDx', amount: '20.000000' },
      destination: { currency: 'EURx', amount: '18.400000' },
      fx: { rate: '0.920000000000' },
    });
  });

  it.each([
    ['deposit', ['deposit', 'deposit']],
    ['swap', ['swap']],
    ['transfer', ['transfer_in', 'transfer_out']],
    ['transfer_out', ['transfer_out']],
    ['transfer_in', ['transfer_in']],
  ])('filters by type=%s', async (type, kinds) => {
    const res = await history(alice, { type });
    expect(res.status).toBe(200);
    expect(res.body.data.map((t: { kind: string }) => t.kind)).toEqual(kinds);
  });

  it('filters by the currency moved on this wallet', async () => {
    const usd = await history(alice, { currency: 'USDx' });
    expect(usd.body.data.map((t: { kind: string }) => t.kind)).toEqual([
      'transfer_out',
      'swap',
      'deposit',
    ]);

    // alice received cXAF, so the cXAF transfer shows up; EURx only moved on bob's side
    const xaf = await history(alice, { currency: 'cXAF' });
    expect(xaf.body.data.map((t: { kind: string }) => t.kind)).toEqual([
      'transfer_in',
    ]);
    const eur = await history(alice, { currency: 'EURx' });
    expect(eur.body.data).toEqual([]);
  });

  it('combines type and currency filters', async () => {
    const res = await history(alice, { type: 'deposit', currency: 'cNGN' });
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].destination.currency).toBe('cNGN');
  });

  it('paginates with an opaque cursor without gaps or duplicates', async () => {
    const all = (await history(alice)).body.data.map(
      (t: { id: string }) => t.id,
    );

    const page1 = await history(alice, { limit: '2' });
    expect(page1.body.pageInfo).toMatchObject({ limit: 2, hasMore: true });

    const page2 = await history(alice, {
      limit: '2',
      cursor: page1.body.pageInfo.nextCursor,
    });
    const page3 = await history(alice, {
      limit: '2',
      cursor: page2.body.pageInfo.nextCursor,
    });
    expect(page3.body.pageInfo).toEqual({
      limit: 2,
      hasMore: false,
      nextCursor: null,
    });

    const paged = [page1, page2, page3].flatMap((p) =>
      p.body.data.map((t: { id: string }) => t.id),
    );
    expect(paged).toEqual(all);
  });

  it.each([
    [{ limit: '0' }],
    [{ limit: '101' }],
    [{ type: 'withdrawal' }],
    [{ currency: 'BTC' }],
  ])('rejects invalid query %j', async (query) => {
    const res = await history(alice, query);
    expect(res.status).toBe(400);
  });

  it('rejects a malformed cursor', async () => {
    const res = await history(alice, { cursor: 'not-a-cursor' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CURSOR');
  });

  it('returns 404 for an unknown wallet', async () => {
    const res = await history(randomUUID());
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('WALLET_NOT_FOUND');
  });

  describe('GET /transactions/:id', () => {
    it('fetches a single transaction', async () => {
      const [latest] = (await history(alice)).body.data;

      const res = await request(server).get(`${API}/transactions/${latest.id}`);

      expect(res.status).toBe(200);
      const { kind: _kind, ...expected } = latest;
      expect(res.body).toEqual(expected);
    });

    it('returns 404 for an unknown transaction', async () => {
      const res = await request(server).get(
        `${API}/transactions/${randomUUID()}`,
      );
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('TRANSACTION_NOT_FOUND');
    });
  });
});
