import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Currency } from '../common/money/currency';
import { formatRate, Money } from '../common/money/money';
import type { FxQuote } from '../fx/fx.types';
import { WalletNotFoundError } from '../wallets/wallet.errors';
import { LedgerEntryEntity } from './entities/ledger-entry.entity';
import {
  TransactionEntity,
  TransactionType,
} from './entities/transaction.entity';
import { InsufficientFundsError } from './ledger.errors';

/** A single balance movement: credit (positive) or debit (negative). */
export interface LedgerLeg {
  walletId: string;
  delta: Money;
}

export interface PostingRequest {
  type: TransactionType;
  sourceWalletId: string | null;
  destinationWalletId: string;
  source: Money | null;
  destination: Money;
  fx: FxQuote | null;
  idempotencyKey: string | null;
  legs: LedgerLeg[];
}

interface LockedBalance {
  wallet_id: string;
  currency: Currency;
  amount: string;
}

const balanceKey = (walletId: string, currency: Currency): string =>
  `${walletId}:${currency}`;

/**
 * The only component allowed to change balances. Every posting runs inside
 * the caller's database transaction and:
 *
 * 1. locks every affected balance row with SELECT … FOR UPDATE, always in
 *    (wallet_id, currency) order, so concurrent postings serialise per
 *    balance and two opposite transfers can never deadlock;
 * 2. re-checks funds against the locked (therefore current) values;
 * 3. writes the transaction, the new balances and one journal entry per leg.
 */
@Injectable()
export class LedgerService {
  async post(
    manager: EntityManager,
    request: PostingRequest,
  ): Promise<TransactionEntity> {
    const balances = await this.lockBalances(manager, request.legs);

    const updates = new Map<string, { walletId: string; next: Money }>();
    for (const leg of request.legs) {
      const key = balanceKey(leg.walletId, leg.delta.currency);
      const current =
        updates.get(key)?.next ??
        balances.get(key) ??
        Money.zero(leg.delta.currency);
      const next = current.add(leg.delta);
      if (next.isNegative()) {
        throw new InsufficientFundsError({
          walletId: leg.walletId,
          currency: leg.delta.currency,
          available: current.toString(),
          requested: leg.delta.negate().toString(),
        });
      }
      updates.set(key, { walletId: leg.walletId, next });
    }

    const transaction = await manager.save(
      manager.create(TransactionEntity, {
        type: request.type,
        sourceWalletId: request.sourceWalletId,
        destinationWalletId: request.destinationWalletId,
        sourceCurrency: request.source?.currency ?? null,
        sourceAmount: request.source?.toString() ?? null,
        destinationCurrency: request.destination.currency,
        destinationAmount: request.destination.toString(),
        fxRate: request.fx ? formatRate(request.fx.rate) : null,
        fxRateSource: request.fx?.source ?? null,
        fxRateProvider: request.fx?.provider ?? null,
        fxRateAsOf: request.fx?.asOf ?? null,
        idempotencyKey: request.idempotencyKey,
      }),
    );

    for (const { walletId, next } of updates.values()) {
      await manager.query(
        `UPDATE wallet_balances
            SET amount = $3, version = version + 1, updated_at = now()
          WHERE wallet_id = $1 AND currency = $2`,
        [walletId, next.currency, next.toString()],
      );
    }

    await manager.insert(
      LedgerEntryEntity,
      request.legs.map((leg) => ({
        transactionId: transaction.id,
        walletId: leg.walletId,
        currency: leg.delta.currency,
        amount: leg.delta.toString(),
        balanceAfter: updates
          .get(balanceKey(leg.walletId, leg.delta.currency))!
          .next.toString(),
      })),
    );

    return transaction;
  }

  private async lockBalances(
    manager: EntityManager,
    legs: LedgerLeg[],
  ): Promise<Map<string, Money>> {
    const keys = [
      ...new Map(
        legs.map((l) => [
          balanceKey(l.walletId, l.delta.currency),
          { walletId: l.walletId, currency: l.delta.currency },
        ]),
      ).values(),
    ];

    const params: string[] = [];
    const tuples = keys.map(({ walletId, currency }) => {
      params.push(walletId, currency);
      return `($${params.length - 1}::uuid, $${params.length})`;
    });

    // ORDER BY before FOR UPDATE => rows are locked in a deterministic order.
    const rows: LockedBalance[] = await manager.query(
      `SELECT wallet_id, currency, amount
         FROM wallet_balances
        WHERE (wallet_id, currency) IN (${tuples.join(', ')})
        ORDER BY wallet_id, currency
          FOR UPDATE`,
      params,
    );

    const found = new Map(
      rows.map((r) => [
        balanceKey(r.wallet_id, r.currency),
        Money.of(r.currency, r.amount),
      ]),
    );
    for (const { walletId, currency } of keys) {
      if (!found.has(balanceKey(walletId, currency))) {
        throw new WalletNotFoundError(walletId);
      }
    }
    return found;
  }
}
