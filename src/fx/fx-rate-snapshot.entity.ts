import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { FiatCode } from '../common/money/currency';

/**
 * Every successful provider fetch is persisted. The latest row is the
 * "last known good" fallback when the provider is down, and the table
 * doubles as an audit trail of the rates the platform has used.
 */
@Entity('fx_rate_snapshots')
@Index('idx_fx_rate_snapshots_fetched_at', ['fetchedAt'])
export class FxRateSnapshotEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'text' })
  provider: string;

  @Column({ type: 'jsonb' })
  rates: Record<FiatCode, string>;

  @Column({ name: 'as_of', type: 'timestamptz' })
  asOf: Date;

  @CreateDateColumn({ name: 'fetched_at', type: 'timestamptz' })
  fetchedAt: Date;
}
