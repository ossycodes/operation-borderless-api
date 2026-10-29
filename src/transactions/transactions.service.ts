import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { DomainError, NotFoundError } from '../common/errors/domain.error';
import {
  TransactionEntity,
  TransactionType,
} from '../ledger/entities/transaction.entity';
import { WalletsService } from '../wallets/wallets.service';
import {
  ListTransactionsQueryDto,
  WalletTransactionKind,
} from './dto/list-transactions.query';
import {
  TransactionPageDto,
  WalletTransactionDto,
} from './dto/transaction-page.response';
import { TransactionResponseDto } from './dto/transaction.response';

export class TransactionNotFoundError extends NotFoundError {
  override readonly code = 'TRANSACTION_NOT_FOUND';

  constructor(transactionId: string) {
    super(`Transaction ${transactionId} was not found`, { transactionId });
  }
}

export class InvalidCursorError extends DomainError {
  readonly code = 'INVALID_CURSOR';
  readonly httpStatus = HttpStatus.BAD_REQUEST;

  constructor() {
    super('cursor is malformed; use pageInfo.nextCursor from a previous page');
  }
}

/** Opaque keyset cursor over the monotonic `seq` column. */
export const TransactionCursor = {
  encode: (seq: string): string => Buffer.from(seq).toString('base64url'),
  decode: (cursor: string): string => {
    const seq = Buffer.from(cursor, 'base64url').toString('utf8');
    if (!/^[1-9]\d{0,18}$/.test(seq)) throw new InvalidCursorError();
    return seq;
  },
};

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(TransactionEntity)
    private readonly transactions: Repository<TransactionEntity>,
    private readonly wallets: WalletsService,
  ) {}

  /**
   * Newest-first history of everything that touched the wallet, using keyset
   * pagination (stable under concurrent inserts, O(limit) per page).
   */
  async listForWallet(
    walletId: string,
    query: ListTransactionsQueryDto,
  ): Promise<TransactionPageDto> {
    await this.wallets.getOrFail(walletId);

    const qb = this.transactions
      .createQueryBuilder('t')
      .where(
        new Brackets((w) =>
          w
            .where('t.sourceWalletId = :walletId')
            .orWhere('t.destinationWalletId = :walletId'),
        ),
      )
      .setParameter('walletId', walletId);

    switch (query.type) {
      case WalletTransactionKind.Deposit:
        qb.andWhere('t.type = :type', { type: TransactionType.Deposit });
        break;
      case WalletTransactionKind.Swap:
        qb.andWhere('t.type = :type', { type: TransactionType.Swap });
        break;
      case WalletTransactionKind.Transfer:
        qb.andWhere('t.type = :type', { type: TransactionType.Transfer });
        break;
      case WalletTransactionKind.TransferIn:
        qb.andWhere('t.type = :type AND t.destinationWalletId = :walletId', {
          type: TransactionType.Transfer,
        });
        break;
      case WalletTransactionKind.TransferOut:
        qb.andWhere('t.type = :type AND t.sourceWalletId = :walletId', {
          type: TransactionType.Transfer,
        });
        break;
      case undefined:
        break;
    }

    if (query.currency) {
      // Match the currency that actually moved on THIS wallet's side.
      qb.andWhere(
        new Brackets((w) =>
          w
            .where(
              't.sourceWalletId = :walletId AND t.sourceCurrency = :currency',
            )
            .orWhere(
              't.destinationWalletId = :walletId AND t.destinationCurrency = :currency',
            ),
        ),
        { currency: query.currency },
      );
    }

    if (query.cursor) {
      qb.andWhere('t.seq < :cursor', {
        cursor: TransactionCursor.decode(query.cursor),
      });
    }

    const rows = await qb
      .orderBy('t.seq', 'DESC')
      .take(query.limit + 1)
      .getMany();

    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);

    return {
      data: page.map((tx) => toWalletTransaction(tx, walletId)),
      pageInfo: {
        limit: query.limit,
        hasMore,
        nextCursor: hasMore && last ? TransactionCursor.encode(last.seq) : null,
      },
    };
  }

  async getById(transactionId: string): Promise<TransactionResponseDto> {
    const tx = await this.transactions.findOne({
      where: { id: transactionId },
    });
    if (!tx) throw new TransactionNotFoundError(transactionId);
    return TransactionResponseDto.from(tx);
  }
}

function toWalletTransaction(
  tx: TransactionEntity,
  walletId: string,
): WalletTransactionDto {
  const kind =
    tx.type === TransactionType.Deposit
      ? WalletTransactionKind.Deposit
      : tx.type === TransactionType.Swap
        ? WalletTransactionKind.Swap
        : tx.sourceWalletId === walletId
          ? WalletTransactionKind.TransferOut
          : WalletTransactionKind.TransferIn;
  return { ...TransactionResponseDto.from(tx), kind };
}
