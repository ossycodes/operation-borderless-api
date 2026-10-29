import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { API, uniqueEmail } from './test-app';

type Server = ReturnType<INestApplication<App>['getHttpServer']>;

export async function createWallet(server: Server): Promise<string> {
  const res = await request(server)
    .post(`${API}/wallets`)
    .send({ email: uniqueEmail() })
    .expect(201);
  return res.body.id as string;
}

export function deposit(
  server: Server,
  walletId: string,
  currency: string,
  amount: string,
  key: string = randomUUID(),
) {
  return request(server)
    .post(`${API}/wallets/${walletId}/deposits`)
    .set('Idempotency-Key', key)
    .send({ currency, amount });
}

export async function createFundedWallet(
  server: Server,
  funds: Record<string, string>,
): Promise<string> {
  const walletId = await createWallet(server);
  for (const [currency, amount] of Object.entries(funds)) {
    await deposit(server, walletId, currency, amount).expect(201);
  }
  return walletId;
}

export async function balanceOf(
  server: Server,
  walletId: string,
  currency: string,
): Promise<string> {
  const res = await request(server)
    .get(`${API}/wallets/${walletId}/balances`)
    .expect(200);
  const balance = (
    res.body.balances as { currency: string; amount: string }[]
  ).find((b) => b.currency === currency);
  if (!balance) throw new Error(`No ${currency} balance`);
  return balance.amount;
}

/**
 * Reconciliation invariant: for every balance of the wallet, the sum of
 * ledger entries equals the stored balance.
 */
export async function expectLedgerReconciles(
  app: INestApplication<App>,
  walletId: string,
): Promise<void> {
  const rows: { currency: string; balance: string; journal: string }[] =
    await app.get(DataSource).query(
      `SELECT b.currency,
              b.amount::text AS balance,
              COALESCE(SUM(e.amount), 0)::numeric(38,6)::text AS journal
         FROM wallet_balances b
         LEFT JOIN ledger_entries e
           ON e.wallet_id = b.wallet_id AND e.currency = b.currency
        WHERE b.wallet_id = $1
        GROUP BY b.currency, b.amount`,
      [walletId],
    );
  for (const row of rows) {
    expect({ currency: row.currency, balance: row.journal }).toEqual({
      currency: row.currency,
      balance: row.balance,
    });
  }
}
