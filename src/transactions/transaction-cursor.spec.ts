import { TransactionCursor } from './transaction-cursor';
import { InvalidCursorError } from './transactions.errors';

describe('TransactionCursor', () => {
  it.each(['1', '42', '9223372036854775807'])('round-trips seq %s', (seq) => {
    expect(TransactionCursor.decode(TransactionCursor.encode(seq))).toBe(seq);
  });

  it('is opaque to clients', () => {
    expect(TransactionCursor.encode('12')).toBe('MTI');
  });

  it.each([
    ['garbage', '!!!'],
    ['zero', TransactionCursor.encode('0')],
    ['a negative seq', TransactionCursor.encode('-5')],
    ['a SQL fragment', TransactionCursor.encode('1 OR 1=1')],
    ['an overlong number', TransactionCursor.encode('1'.repeat(20))],
  ])('rejects %s', (_label, cursor) => {
    expect(() => TransactionCursor.decode(cursor)).toThrow(InvalidCursorError);
  });
});
