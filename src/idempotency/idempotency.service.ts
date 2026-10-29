import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { BusinessRuleError } from '../common/errors/domain.error';
import { isPgError, PgErrorCode } from '../database/pg-errors';
import { IdempotencyKeyEntity } from './idempotency-key.entity';

export class IdempotencyKeyReusedError extends BusinessRuleError {
  override readonly code = 'IDEMPOTENCY_KEY_REUSED';

  constructor(key: string) {
    super(
      'This Idempotency-Key was already used with a different request payload',
      { idempotencyKey: key },
    );
  }
}

export interface IdempotencyContext {
  scope: string;
  key: string;
  /** Anything that identifies the request: route params + body. */
  request: unknown;
}

export interface Outcome<T> {
  statusCode: number;
  body: T;
  transactionId?: string;
}

export interface IdempotentResult<T> extends Outcome<T> {
  replayed: boolean;
}

/**
 * A first-time operation, in two phases:
 * - `prepare` runs outside any database transaction (e.g. fetching an FX
 *   quote) and only when the key is new, so a replay never re-quotes and can
 *   never fail on a condition that has changed since the original request;
 * - `run` executes inside the transaction that also claims the key.
 */
export interface IdempotentOperation<T, P> {
  prepare: () => Promise<P>;
  run: (manager: EntityManager, prepared: P) => Promise<Outcome<T>>;
}

/**
 * Exactly-once execution for mutating operations.
 *
 * The key is claimed with an INSERT in the SAME database transaction as the
 * ledger posting. Consequences:
 * - a concurrent duplicate blocks on the primary key until the first request
 *   commits (then it replays the stored response) or rolls back (then it
 *   proceeds as if it were first);
 * - a crash can never leave "money moved but key not stored" or vice versa;
 * - failed attempts (e.g. insufficient funds) store nothing, so the client
 *   may retry the same key once the cause is fixed.
 */
@Injectable()
export class IdempotencyService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(IdempotencyKeyEntity)
    private readonly keys: Repository<IdempotencyKeyEntity>,
  ) {}

  async execute<T, P>(
    context: IdempotencyContext,
    operation: IdempotentOperation<T, P>,
  ): Promise<IdempotentResult<T>> {
    const requestHash = fingerprint(context.request);
    const { scope, key } = context;

    const existing = await this.keys.findOne({ where: { scope, key } });
    if (existing) return this.replay<T>(existing, requestHash);

    const prepared = await operation.prepare();

    try {
      return await this.dataSource.transaction(async (manager) => {
        await manager.insert(IdempotencyKeyEntity, {
          scope,
          key,
          requestHash,
          responseStatus: null,
          responseBody: null,
          transactionId: null,
        });

        const outcome = await operation.run(manager, prepared);

        await manager.query(
          `UPDATE idempotency_keys
              SET response_status = $3, response_body = $4::jsonb, transaction_id = $5
            WHERE scope = $1 AND key = $2`,
          [
            scope,
            key,
            outcome.statusCode,
            JSON.stringify(outcome.body),
            outcome.transactionId ?? null,
          ],
        );
        return { ...outcome, replayed: false };
      });
    } catch (error) {
      if (
        isPgError(error, PgErrorCode.UniqueViolation, 'pk_idempotency_keys')
      ) {
        // Lost the race to a concurrent duplicate that has now committed.
        const winner = await this.keys.findOne({ where: { scope, key } });
        if (winner) return this.replay<T>(winner, requestHash);
      }
      throw error;
    }
  }

  private replay<T>(
    stored: IdempotencyKeyEntity,
    requestHash: string,
  ): IdempotentResult<T> {
    if (stored.requestHash !== requestHash) {
      throw new IdempotencyKeyReusedError(stored.key);
    }
    return {
      statusCode: stored.responseStatus ?? 200,
      body: stored.responseBody as T,
      transactionId: stored.transactionId ?? undefined,
      replayed: true,
    };
  }
}

/** Order-independent SHA-256 of a JSON-like value. */
export function fingerprint(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}
