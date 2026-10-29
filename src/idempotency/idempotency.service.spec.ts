import { DataSource, EntityManager, Repository } from 'typeorm';
import { IdempotencyKeyEntity } from './idempotency-key.entity';
import {
  fingerprint,
  IdempotencyKeyReusedError,
  IdempotencyService,
} from './idempotency.service';

describe('fingerprint', () => {
  it('is independent of object key order', () => {
    expect(fingerprint({ a: 1, b: { c: '2', d: [1, 2] } })).toBe(
      fingerprint({ b: { d: [1, 2], c: '2' }, a: 1 }),
    );
  });

  it('ignores undefined properties', () => {
    expect(fingerprint({ a: 1, b: undefined })).toBe(fingerprint({ a: 1 }));
  });

  it('distinguishes different payloads', () => {
    expect(fingerprint({ amount: '10.00' })).not.toBe(
      fingerprint({ amount: '10.0' }),
    );
    expect(fingerprint([1, 2])).not.toBe(fingerprint([2, 1]));
  });
});

const context = {
  scope: 'swap:wallet-1',
  key: 'key-0001',
  request: { walletId: 'wallet-1', amount: '10' },
};

const outcome = {
  statusCode: 201,
  body: { id: 'tx-1' },
  transactionId: 'tx-1',
};

function build(existing: Partial<IdempotencyKeyEntity> | null) {
  const manager = {
    insert: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue(undefined),
  };
  const dataSource = {
    transaction: jest.fn(
      (work: (m: EntityManager) => Promise<unknown>): Promise<unknown> =>
        work(manager as unknown as EntityManager),
    ),
  };
  const keys = { findOne: jest.fn().mockResolvedValue(existing) };
  const service = new IdempotencyService(
    dataSource as unknown as DataSource,
    keys as unknown as Repository<IdempotencyKeyEntity>,
  );
  return { service, manager, dataSource };
}

describe('IdempotencyService.execute', () => {
  it('prepares outside the transaction, then runs inside the one that claims the key', async () => {
    const { service, manager, dataSource } = build(null);
    const prepare = jest.fn().mockResolvedValue('pinned-quote');
    const run = jest.fn().mockResolvedValue(outcome);

    const result = await service.execute(context, { prepare, run });

    expect(result).toEqual({ ...outcome, replayed: false });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(prepare.mock.invocationCallOrder[0]).toBeLessThan(
      dataSource.transaction.mock.invocationCallOrder[0],
    );
    expect(run).toHaveBeenCalledWith(manager, 'pinned-quote');
    expect(manager.insert).toHaveBeenCalledTimes(1);
  });

  it('replays a stored response without preparing or running again', async () => {
    const { service, dataSource } = build({
      key: context.key,
      requestHash: fingerprint(context.request),
      responseStatus: outcome.statusCode,
      responseBody: outcome.body,
      transactionId: outcome.transactionId,
    });
    const prepare = jest.fn();
    const run = jest.fn();

    await expect(service.execute(context, { prepare, run })).resolves.toEqual({
      ...outcome,
      replayed: true,
    });
    expect(prepare).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rejects a reused key carrying a different payload', async () => {
    const { service } = build({
      key: context.key,
      requestHash: fingerprint({ walletId: 'wallet-1', amount: '99' }),
    });
    const prepare = jest.fn();

    await expect(
      service.execute(context, { prepare, run: jest.fn() }),
    ).rejects.toThrow(IdempotencyKeyReusedError);
    expect(prepare).not.toHaveBeenCalled();
  });

  it('claims nothing when preparation fails, so the key stays retryable', async () => {
    const { service, dataSource } = build(null);

    await expect(
      service.execute(context, {
        prepare: () => Promise.reject(new Error('quote failed')),
        run: jest.fn(),
      }),
    ).rejects.toThrow('quote failed');
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});
