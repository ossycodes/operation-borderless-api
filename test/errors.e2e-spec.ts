import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { API, createTestApp } from './utils/test-app';

/** Every failure, wherever it originates, uses the same error envelope. */
describe('Error envelope (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('wraps malformed JSON bodies', async () => {
    const res = await request(app.getHttpServer())
      .post(`${API}/wallets`)
      .set('Content-Type', 'application/json')
      .set('x-request-id', 'trace-malformed-1')
      .send('{"email": ');

    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
      statusCode: 400,
      path: `${API}/wallets`,
      requestId: 'trace-malformed-1',
    });
  });

  it('wraps unknown routes', async () => {
    const res = await request(app.getHttpServer()).get(`${API}/nope`);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      error: { code: 'NOT_FOUND' },
      statusCode: 404,
    });
  });

  it('mints a request id when the client sends none, and echoes it', async () => {
    const res = await request(app.getHttpServer()).get(`${API}/nope`);

    expect(res.headers['x-request-id']).toEqual(expect.any(String));
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });

  it('replaces an unsafe client request id instead of reflecting it', async () => {
    const res = await request(app.getHttpServer())
      .get(`${API}/nope`)
      .set('x-request-id', '<script>alert(1)</script>');

    expect(res.headers['x-request-id']).not.toContain('<');
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });
});
