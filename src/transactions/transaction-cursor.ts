import { InvalidCursorError } from './transactions.errors';

/** A positive BIGSERIAL value, as Postgres returns it (a decimal string). */
const SEQ = /^[1-9]\d{0,18}$/;

/** Opaque keyset cursor over the monotonic `seq` column. */
export const TransactionCursor = {
  encode: (seq: string): string => Buffer.from(seq).toString('base64url'),
  decode: (cursor: string): string => {
    const seq = Buffer.from(cursor, 'base64url').toString('utf8');
    if (!SEQ.test(seq)) throw new InvalidCursorError();
    return seq;
  },
};
