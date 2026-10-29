import { fingerprint } from './idempotency.service';

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
