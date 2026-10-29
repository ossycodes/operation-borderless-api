import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { API, createTestApp, uniqueEmail, uniquePhone } from './utils/test-app';

describe('Wallets (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const createWallet = (body: object) =>
    request(app.getHttpServer()).post(`${API}/wallets`).send(body);

  describe('POST /wallets', () => {
    it('creates a wallet by email with a zero balance in every stablecoin', async () => {
      const email = uniqueEmail();
      const res = await createWallet({ email: `  ${email.toUpperCase()} ` });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id: expect.any(String),
        email,
        phoneNumber: null,
        portfolio: { totalUsd: '0.00', rateSource: 'static' },
      });
      expect(
        res.body.portfolio.balances.map(
          (b: { currency: string; amount: string }) => [b.currency, b.amount],
        ),
      ).toEqual([
        ['cNGN', '0.000000'],
        ['cGHS', '0.000000'],
        ['cXAF', '0.000000'],
        ['USDx', '0.000000'],
        ['EURx', '0.000000'],
      ]);
    });

    it('creates a wallet by mobile number', async () => {
      const phoneNumber = uniquePhone();
      const res = await createWallet({ phoneNumber });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ email: null, phoneNumber });
    });

    it('requires an email or a phone number', async () => {
      const res = await createWallet({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      [{ email: 'not-an-email' }],
      [{ phoneNumber: '08012345678' }],
      [{ email: uniqueEmail(), extra: 'field' }],
    ])('rejects invalid payload %j', async (body) => {
      const res = await createWallet(body);
      expect(res.status).toBe(400);
    });

    it('rejects a second wallet for the same email (case-insensitive)', async () => {
      const email = uniqueEmail();
      await createWallet({ email }).expect(201);

      const res = await createWallet({ email: email.toUpperCase() });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({
        code: 'WALLET_ALREADY_EXISTS',
        details: { field: 'email' },
      });
    });

    it('rejects a second wallet for the same phone number', async () => {
      const phoneNumber = uniquePhone();
      await createWallet({ phoneNumber }).expect(201);

      const res = await createWallet({ phoneNumber, email: uniqueEmail() });

      expect(res.status).toBe(409);
      expect(res.body.error.details).toEqual({ field: 'phoneNumber' });
    });

    it('lets exactly one of many concurrent sign-ups for the same email win', async () => {
      const email = uniqueEmail();
      const results = await Promise.all(
        Array.from({ length: 8 }, () => createWallet({ email })),
      );
      const statuses = results.map((r) => r.status).sort();

      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
      expect(statuses.filter((s) => s === 409)).toHaveLength(7);
    });
  });

  describe('GET /wallets/:id', () => {
    it('returns the wallet with balances', async () => {
      const created = await createWallet({ email: uniqueEmail() });
      const res = await request(app.getHttpServer()).get(
        `${API}/wallets/${created.body.id}`,
      );

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(created.body.id);
      expect(res.body.portfolio.balances).toHaveLength(5);
    });

    it('returns 404 for an unknown wallet', async () => {
      const res = await request(app.getHttpServer()).get(
        `${API}/wallets/${randomUUID()}`,
      );
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('WALLET_NOT_FOUND');
    });

    it('returns 400 for a malformed id', async () => {
      await request(app.getHttpServer())
        .get(`${API}/wallets/not-a-uuid`)
        .expect(400);
    });
  });

  describe('GET /wallets/:id/balances', () => {
    it('returns balances, USD total and rate metadata', async () => {
      const created = await createWallet({ email: uniqueEmail() });
      const res = await request(app.getHttpServer()).get(
        `${API}/wallets/${created.body.id}/balances`,
      );

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        walletId: created.body.id,
        totalUsd: '0.00',
        rateSource: 'static',
        ratesRefreshedAt: expect.any(String),
      });
    });
  });
});
