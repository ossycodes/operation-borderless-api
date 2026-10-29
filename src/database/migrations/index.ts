import { CreateFxRateSnapshots1793260000000 } from './1793260000000-CreateFxRateSnapshots';
import { CreateWallets1793260100000 } from './1793260100000-CreateWallets';
import { CreateLedger1793260200000 } from './1793260200000-CreateLedger';
import { CreateIdempotencyKeys1793260300000 } from './1793260300000-CreateIdempotencyKeys';
import { IndexIdempotencyKeysCreatedAt1793260400000 } from './1793260400000-IndexIdempotencyKeysCreatedAt';

/**
 * Explicit, ordered migration list. Registering classes (rather than a file
 * glob) works identically under ts-node, ts-jest and the compiled build.
 */
export const MIGRATIONS = [
  CreateFxRateSnapshots1793260000000,
  CreateWallets1793260100000,
  CreateLedger1793260200000,
  CreateIdempotencyKeys1793260300000,
  IndexIdempotencyKeysCreatedAt1793260400000,
];
