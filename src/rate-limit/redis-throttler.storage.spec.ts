import type Redis from 'ioredis';
import { RedisThrottlerStorage } from './redis-throttler.storage';

const storageWith = (evalImpl: jest.Mock) =>
  new RedisThrottlerStorage({ eval: evalImpl } as unknown as Redis);

describe('RedisThrottlerStorage', () => {
  it('maps the script reply to a throttler record (ms → whole seconds)', async () => {
    const evalMock = jest.fn().mockResolvedValue([3, 59_001, -2]);

    const record = await storageWith(evalMock).increment(
      'abc',
      60_000,
      5,
      60_000,
      'default',
    );

    expect(record).toEqual({
      totalHits: 3,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
    expect(evalMock).toHaveBeenCalledWith(
      expect.any(String),
      2,
      'harmattan:throttle:default:abc',
      'harmattan:throttle:default:abc:blocked',
      60_000,
      5,
      60_000,
    );
  });

  it('reports a block and how long it lasts', async () => {
    const storage = storageWith(
      jest.fn().mockResolvedValue([6, 30_000, 45_500]),
    );

    await expect(
      storage.increment('abc', 60_000, 5, 60_000, 'writes'),
    ).resolves.toMatchObject({ isBlocked: true, timeToBlockExpire: 46 });
  });

  it('fails open when Redis is unavailable', async () => {
    const storage = storageWith(
      jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    );

    await expect(
      storage.increment('abc', 60_000, 5, 60_000, 'default'),
    ).resolves.toEqual({
      totalHits: 0,
      timeToExpire: 0,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });
});
