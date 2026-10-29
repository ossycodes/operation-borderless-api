import { DataSource, EntityManager, Repository } from 'typeorm';
import { AppConfigService } from '../config/app-config.service';
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
  const keys = {
    findOne: jest
      .fn()
      .mockResolvedValue(existing && { createdAt: new Date(), ...existing }),
  };
  const config = {
    idempotency: { keyTtlHours: 24 },
  } as unknown as AppConfigService;
  const service = new IdempotencyService(
    dataSource as unknown as DataSource,
    keys as unknown as Repository<IdempotencyKeyEntity>,
    config,
  );
  return { service, manager, dataSource };
}

const hoursAgo = (hours: number): Date =>
  new Date(Date.now() - hours * 3_600_000);

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

  it('still replays a key just inside its TTL', async () => {
    const { service } = build({
      key: context.key,
      requestHash: fingerprint(context.request),
      responseStatus: 201,
      responseBody: outcome.body,
      createdAt: hoursAgo(23.9),
    });

    await expect(
      service.execute(context, { prepare: jest.fn(), run: jest.fn() }),
    ).resolves.toMatchObject({ replayed: true });
  });

  it('treats an expired key as unused: releases it, then claims it again', async () => {
    const { service, manager } = build({
      key: context.key,
      // Even a different payload is fine once the key has expired.
      requestHash: fingerprint({ walletId: 'wallet-1', amount: '99' }),
      createdAt: hoursAgo(25),
    });
    const prepare = jest.fn().mockResolvedValue('fresh-quote');
    const run = jest.fn().mockResolvedValue(outcome);

    const result = await service.execute(context, { prepare, run });

    expect(result).toEqual({ ...outcome, replayed: false });
    expect(prepare).toHaveBeenCalledTimes(1);
    const [releaseSql, releaseParams] = manager.query.mock.calls[0] as [
      string,
      unknown[],
    ];
    expect(releaseSql).toMatch(/DELETE FROM idempotency_keys/);
    expect(releaseParams).toEqual([context.scope, context.key, 24]);
    expect(manager.query.mock.invocationCallOrder[0]).toBeLessThan(
      manager.insert.mock.invocationCallOrder[0],
    );
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
