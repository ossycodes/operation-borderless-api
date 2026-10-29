import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  balanceOf,
  createFundedWallet,
  createWallet,
  expectLedgerReconciles,
} from './utils/fixtures';
import { API, createTestApp } from './utils/test-app';

describe('Transfers (e2e)', () => {
  let app: INestApplication<App>;
  let server: ReturnType<INestApplication<App>['getHttpServer']>;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  const transfer = (
    fromWalletId: string,
    body: object,
    key: string = randomUUID(),
  ) =>
    request(server)
      .post(`${API}/wallets/${fromWalletId}/transfers`)
      .set('Idempotency-Key', key)
      .send(body);

  it('moves funds between wallets in the same currency', async () => {
    const sender = await createFundedWallet(server, { USDx: '100' });
    const receiver = await createWallet(server);

    const res = await transfer(sender, {
      destinationWalletId: receiver,
      sourceCurrency: 'USDx',
      amount: '30.25',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      type: 'TRANSFER',
      sourceWalletId: sender,
      destinationWalletId: receiver,
      source: { currency: 'USDx', amount: '30.250000' },
      destination: { currency: 'USDx', amount: '30.250000' },
      fx: null,
      createdAt: expect.any(String),
    });
    await expect(balanceOf(server, sender, 'USDx')).resolves.toBe('69.750000');
    await expect(balanceOf(server, receiver, 'USDx')).resolves.toBe(
      '30.250000',
    );
  });

  it('converts automatically when the currencies differ and records the rate', async () => {
    const sender = await createFundedWallet(server, { USDx: '100' });
    const receiver = await createWallet(server);

    const res = await transfer(sender, {
      destinationWalletId: receiver,
      sourceCurrency: 'USDx',
      destinationCurrency: 'cNGN',
      amount: '10',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      source: { currency: 'USDx', amount: '10.000000' },
      destination: { currency: 'cNGN', amount: '15500.000000' },
      fx: { rate: '1550.000000000000', source: 'static' },
    });
    await expect(balanceOf(server, receiver, 'cNGN')).resolves.toBe(
      '15500.000000',
    );
    await expectLedgerReconciles(app, sender);
    await expectLedgerReconciles(app, receiver);
  });

  it('rejects a transfer the sender cannot afford and moves nothing', async () => {
    const sender = await createFundedWallet(server, { cGHS: '50' });
    const receiver = await createWallet(server);

    const res = await transfer(sender, {
      destinationWalletId: receiver,
      sourceCurrency: 'cGHS',
      amount: '50.000001',
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_FUNDS');
    await expect(balanceOf(server, sender, 'cGHS')).resolves.toBe('50.000000');
    await expect(balanceOf(server, receiver, 'cGHS')).resolves.toBe('0.000000');
  });

  it('rejects sending to the same wallet', async () => {
    const wallet = await createFundedWallet(server, { USDx: '10' });
    const res = await transfer(wallet, {
      destinationWalletId: wallet,
      sourceCurrency: 'USDx',
      amount: '1',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('SELF_TRANSFER');
  });

  it('returns 404 when the destination wallet does not exist', async () => {
    const sender = await createFundedWallet(server, { USDx: '10' });
    const res = await transfer(sender, {
      destinationWalletId: randomUUID(),
      sourceCurrency: 'USDx',
      amount: '1',
    });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('WALLET_NOT_FOUND');
    await expect(balanceOf(server, sender, 'USDx')).resolves.toBe('10.000000');
  });

  it('replays a retried transfer instead of sending twice', async () => {
    const sender = await createFundedWallet(server, { EURx: '100' });
    const receiver = await createWallet(server);
    const key = randomUUID();
    const body = {
      destinationWalletId: receiver,
      sourceCurrency: 'EURx',
      amount: '40',
    };

    const first = await transfer(sender, body, key);
    const retry = await transfer(sender, body, key);

    expect(retry.status).toBe(201);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(retry.body).toEqual(first.body);
    await expect(balanceOf(server, sender, 'EURx')).resolves.toBe('60.000000');
    await expect(balanceOf(server, receiver, 'EURx')).resolves.toBe(
      '40.000000',
    );
  });

  it('handles simultaneous opposite transfers without deadlocks or lost updates', async () => {
    const alice = await createFundedWallet(server, { USDx: '1000' });
    const bob = await createFundedWallet(server, { USDx: '1000' });

    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        i % 2 === 0
          ? transfer(alice, {
              destinationWalletId: bob,
              sourceCurrency: 'USDx',
              amount: '7',
            })
          : transfer(bob, {
              destinationWalletId: alice,
              sourceCurrency: 'USDx',
              amount: '3',
            }),
      ),
    );

    expect(results.map((r) => r.status)).toEqual(Array(30).fill(201));
    // alice: 1000 - 15*7 + 15*3 = 940 ; bob: 1000 + 105 - 45 = 1060
    await expect(balanceOf(server, alice, 'USDx')).resolves.toBe('940.000000');
    await expect(balanceOf(server, bob, 'USDx')).resolves.toBe('1060.000000');
    await expectLedgerReconciles(app, alice);
    await expectLedgerReconciles(app, bob);
  });

  it('never overdraws the sender under concurrent transfers', async () => {
    const sender = await createFundedWallet(server, { USDx: '100' });
    const receivers = await Promise.all(
      Array.from({ length: 10 }, () => createWallet(server)),
    );

    const results = await Promise.all(
      receivers.map((receiver) =>
        transfer(sender, {
          destinationWalletId: receiver,
          sourceCurrency: 'USDx',
          amount: '15',
        }),
      ),
    );

    expect(results.filter((r) => r.status === 201)).toHaveLength(6);
    expect(results.filter((r) => r.status === 422)).toHaveLength(4);
    await expect(balanceOf(server, sender, 'USDx')).resolves.toBe('10.000000');
    await expectLedgerReconciles(app, sender);
  });
});
