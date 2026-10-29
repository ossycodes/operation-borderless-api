import { MigrationInterface, QueryRunner } from 'typeorm';
import { CURRENCY_CHECK } from './1793260100000-CreateWallets';

export class CreateLedger1793260200000 implements MigrationInterface {
  name = 'CreateLedger1793260200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE transactions (
        id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        -- Monotonic insertion order: stable newest-first ordering and
        -- keyset pagination cursors without timestamp ties.
        seq                    BIGSERIAL     NOT NULL UNIQUE,
        type                   TEXT          NOT NULL CHECK (type IN ('DEPOSIT', 'SWAP', 'TRANSFER')),
        status                 TEXT          NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED')),
        source_wallet_id       UUID          REFERENCES wallets (id),
        destination_wallet_id  UUID          NOT NULL REFERENCES wallets (id),
        source_currency        TEXT          CHECK (source_currency IN ${CURRENCY_CHECK}),
        source_amount          NUMERIC(38,6) CHECK (source_amount > 0),
        destination_currency   TEXT          NOT NULL CHECK (destination_currency IN ${CURRENCY_CHECK}),
        destination_amount     NUMERIC(38,6) NOT NULL CHECK (destination_amount > 0),
        fx_rate                NUMERIC(38,12) CHECK (fx_rate > 0),
        fx_rate_source         TEXT,
        fx_rate_provider       TEXT,
        fx_rate_as_of          TIMESTAMPTZ,
        idempotency_key        TEXT,
        created_at             TIMESTAMPTZ   NOT NULL DEFAULT now(),

        -- Shape rules per transaction type, enforced by the database.
        CONSTRAINT chk_transactions_deposit_shape CHECK (
          type <> 'DEPOSIT' OR (
            source_wallet_id IS NULL AND source_currency IS NULL AND source_amount IS NULL
          )
        ),
        CONSTRAINT chk_transactions_swap_shape CHECK (
          type <> 'SWAP' OR (
            source_wallet_id = destination_wallet_id
            AND source_currency IS NOT NULL AND source_amount IS NOT NULL
            AND source_currency <> destination_currency
            AND fx_rate IS NOT NULL
          )
        ),
        CONSTRAINT chk_transactions_transfer_shape CHECK (
          type <> 'TRANSFER' OR (
            source_wallet_id IS NOT NULL AND source_wallet_id <> destination_wallet_id
            AND source_currency IS NOT NULL AND source_amount IS NOT NULL
          )
        )
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_transactions_source_wallet ON transactions (source_wallet_id, seq DESC) WHERE source_wallet_id IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_transactions_destination_wallet ON transactions (destination_wallet_id, seq DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE ledger_entries (
        id              BIGSERIAL     PRIMARY KEY,
        transaction_id  UUID          NOT NULL REFERENCES transactions (id),
        wallet_id       UUID          NOT NULL,
        currency        TEXT          NOT NULL,
        -- Signed movement: positive = credit, negative = debit.
        amount          NUMERIC(38,6) NOT NULL CHECK (amount <> 0),
        balance_after   NUMERIC(38,6) NOT NULL CHECK (balance_after >= 0),
        created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
        FOREIGN KEY (wallet_id, currency) REFERENCES wallet_balances (wallet_id, currency)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_ledger_entries_wallet_currency ON ledger_entries (wallet_id, currency, id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_ledger_entries_transaction ON ledger_entries (transaction_id)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE ledger_entries`);
    await queryRunner.query(`DROP TABLE transactions`);
  }
}
