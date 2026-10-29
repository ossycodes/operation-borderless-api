import {
  Column,
  CreateDateColumn,
  Entity,
  Generated,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Currency } from '../../common/money/currency';
import type { RateSource } from '../../fx/fx.types';

export enum TransactionType {
  Deposit = 'DEPOSIT',
  Swap = 'SWAP',
  Transfer = 'TRANSFER',
}

export enum TransactionStatus {
  Completed = 'COMPLETED',
}

/**
 * Immutable business event. Monetary columns are NUMERIC and surface as
 * strings; they are only ever interpreted through the Money value object.
 */
@Entity('transactions')
export class TransactionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'bigint' })
  @Generated('increment')
  seq: string;

  @Column({ type: 'text' })
  type: TransactionType;

  @Column({ type: 'text', default: TransactionStatus.Completed })
  status: TransactionStatus;

  @Column({ name: 'source_wallet_id', type: 'uuid', nullable: true })
  sourceWalletId: string | null;

  @Column({ name: 'destination_wallet_id', type: 'uuid' })
  destinationWalletId: string;

  @Column({ name: 'source_currency', type: 'text', nullable: true })
  sourceCurrency: Currency | null;

  @Column({
    name: 'source_amount',
    type: 'numeric',
    precision: 38,
    scale: 6,
    nullable: true,
  })
  sourceAmount: string | null;

  @Column({ name: 'destination_currency', type: 'text' })
  destinationCurrency: Currency;

  @Column({
    name: 'destination_amount',
    type: 'numeric',
    precision: 38,
    scale: 6,
  })
  destinationAmount: string;

  @Column({
    name: 'fx_rate',
    type: 'numeric',
    precision: 38,
    scale: 12,
    nullable: true,
  })
  fxRate: string | null;

  @Column({ name: 'fx_rate_source', type: 'text', nullable: true })
  fxRateSource: RateSource | null;

  @Column({ name: 'fx_rate_provider', type: 'text', nullable: true })
  fxRateProvider: string | null;

  @Column({ name: 'fx_rate_as_of', type: 'timestamptz', nullable: true })
  fxRateAsOf: Date | null;

  @Column({ name: 'idempotency_key', type: 'text', nullable: true })
  idempotencyKey: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
