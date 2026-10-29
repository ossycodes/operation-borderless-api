import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { Currency } from '../src/common/money/currency';
import { Money } from '../src/common/money/money';
import { TransactionType } from '../src/ledger/entities/transaction.entity';
import { LedgerService } from '../src/ledger/ledger.service';
import { createWallet, deposit } from './utils/fixtures';
import { API, createTestApp } from './utils/test-app';

/**
 * History pages are keyset-paginated on `seq`. That is only gap-free if,
 * for any one wallet, rows become visible in `seq` order: a posting that
 * commits late must never hold a lower `seq` than one a reader has already
 * paged past.
 */
describe('History ordering under concurrency (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('a later posting on the same wallet waits for an earlier one to commit, even in another currency', async () => {
    const server = app.getHttpServer();
    const walletId = await createWallet(server);
    const runner = app.get(DataSource).createQueryRunner();
    await runner.connect();
    await runner.startTransaction();

    try {
      // Posting A draws its seq, then stays uncommitted (a slow commit).
      const amount = Money.parse(Currency.cNGN, '1');
      const slow = await app.get(LedgerService).post(runner.manager, {
        type: TransactionType.Deposit,
        sourceWalletId: null,
        destinationWalletId: walletId,
        source: null,
        destination: amount,
        fx: null,
        idempotencyKey: null,
        legs: [{ walletId, delta: amount }],
      });

      // Posting B touches a different balance row (cGHS). If it could commit
      // now, a reader would see B and page past A's lower seq before A
      // becomes visible: A would be skipped forever.
      let settled = false;
      const fast = deposit(server, walletId, 'cGHS', '1').then((res) => {
        settled = true;
        return res;
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(settled).toBe(false);

      const whileBlocked = await request(server)
        .get(`${API}/wallets/${walletId}/transactions`)
        .expect(200);
      expect(whileBlocked.body.data).toEqual([]);

      await runner.commitTransaction();
      const res = await fast;
      expect(res.status).toBe(201);

      const history = await request(server)
        .get(`${API}/wallets/${walletId}/transactions`)
        .expect(200);
      expect(
        (history.body.data as { id: string }[]).map((tx) => tx.id),
      ).toEqual([res.body.id, slow.id]);
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
