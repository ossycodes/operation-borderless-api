import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Currency } from '../../common/money/currency';
import { TransactionEntity } from './transaction.entity';

/**
 * Append-only journal of every balance movement. For any (wallet,
 * currency), the sum of entries equals the balance and the latest
 * `balance_after` equals the current balance — a reconciliation invariant
 * the test suite checks.
 */
@Entity('ledger_entries')
export class LedgerEntryEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'transaction_id', type: 'uuid' })
  transactionId: string;

  @ManyToOne(() => TransactionEntity)
  @JoinColumn({ name: 'transaction_id' })
  transaction?: TransactionEntity;

  @Column({ name: 'wallet_id', type: 'uuid' })
  walletId: string;

  @Column({ type: 'text' })
  currency: Currency;

  @Column({ type: 'numeric', precision: 38, scale: 6 })
  amount: string;

  @Column({ name: 'balance_after', type: 'numeric', precision: 38, scale: 6 })
  balanceAfter: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
