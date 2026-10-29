import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { Currency } from '../../common/money/currency';
import { WalletEntity } from './wallet.entity';

/**
 * One row per (wallet, currency). `amount` is NUMERIC(38,6); the pg driver
 * returns it as a string, which we keep as-is and only ever handle through
 * the Money value object.
 */
@Entity('wallet_balances')
export class WalletBalanceEntity {
  @PrimaryColumn({ name: 'wallet_id', type: 'uuid' })
  walletId: string;

  @PrimaryColumn({ type: 'text' })
  currency: Currency;

  @Column({ type: 'numeric', precision: 38, scale: 6 })
  amount: string;

  @VersionColumn()
  version: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => WalletEntity, (wallet) => wallet.balances, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'wallet_id' })
  wallet?: WalletEntity;
}
