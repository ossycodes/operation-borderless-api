import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('idempotency_keys')
export class IdempotencyKeyEntity {
  /** Namespace, e.g. `deposit:<walletId>` — keys are unique per scope. */
  @PrimaryColumn({ type: 'text' })
  scope: string;

  @PrimaryColumn({ type: 'text' })
  key: string;

  /** SHA-256 of the canonical request, to detect key reuse with a new payload. */
  @Column({ name: 'request_hash', type: 'text' })
  requestHash: string;

  @Column({ name: 'response_status', type: 'integer', nullable: true })
  responseStatus: number | null;

  @Column({ name: 'response_body', type: 'jsonb', nullable: true })
  responseBody: Record<string, unknown> | null;

  @Column({ name: 'transaction_id', type: 'uuid', nullable: true })
  transactionId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
