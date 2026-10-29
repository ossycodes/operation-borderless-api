import { randomInt } from 'node:crypto';
import { INestApplication, Injectable } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppConfigService } from '../src/config/app-config.service';
import { API, createTestApp, uniqueEmail } from './utils/test-app';

@Injectable()
class TightLimitsConfig extends AppConfigService {
  override get rateLimit() {
    return { windowSeconds: 60, maxRequests: 5, maxWrites: 2 };
  }
}

/** A fresh client per test, so tests never share a rate-limit bucket. */
const newClientIp = (): string =>
  `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;

describe('Rate limiting (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp({
      trustProxyHops: 1,
      override: (builder) =>
        builder.overrideProvider(AppConfigService).useClass(TightLimitsConfig),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const getRates = (ip: string) =>
    request(app.getHttpServer())
      .get(`${API}/fx/rates`)
      .set('X-Forwarded-For', ip);

  const createWallet = (ip: string) =>
    request(app.getHttpServer())
      .post(`${API}/wallets`)
      .set('X-Forwarded-For', ip)
      .send({ email: uniqueEmail() });

  it('advertises the budget and rejects requests beyond it with 429', async () => {
    const ip = newClientIp();

    for (let i = 1; i <= 5; i++) {
      const res = await getRates(ip).expect(200);
      expect(res.headers['x-ratelimit-limit']).toBe('5');
      expect(res.headers['x-ratelimit-remaining']).toBe(String(5 - i));
    }

    const blocked = await getRates(ip);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(blocked.body).toMatchObject({
      error: { code: 'RATE_LIMITED' },
      statusCode: 429,
    });
  });

  it('gives writes a tighter budget than reads', async () => {
    const ip = newClientIp();

    await createWallet(ip).expect(201);
    await createWallet(ip).expect(201);
    const res = await createWallet(ip);

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    // The client can still read: the write budget is separate.
    await getRates(ip).expect(200);
  });

  it('limits each client independently', async () => {
    const noisy = newClientIp();
    for (let i = 0; i < 5; i++) await getRates(noisy).expect(200);
    await getRates(noisy).expect(429);

    await getRates(newClientIp()).expect(200);
  });

  it('never throttles health checks', async () => {
    const ip = newClientIp();
    for (let i = 0; i < 10; i++) {
      await request(app.getHttpServer())
        .get('/health')
        .set('X-Forwarded-For', ip)
        .expect(200);
    }
  });
});
