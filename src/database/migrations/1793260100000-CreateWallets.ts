import { MigrationInterface, QueryRunner } from 'typeorm';

export const CURRENCY_CHECK = `('cNGN', 'cGHS', 'cXAF', 'USDx', 'EURx')`;

export class CreateWallets1793260100000 implements MigrationInterface {
  name = 'CreateWallets1793260100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE wallets (
        id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        email         TEXT,
        phone_number  TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_wallets_owner_identifier
          CHECK (email IS NOT NULL OR phone_number IS NOT NULL),
        CONSTRAINT chk_wallets_email_normalised
          CHECK (email IS NULL OR email = lower(email))
      )
    `);
    // One wallet per email / per phone number, enforced by the database so
    // two concurrent sign-ups cannot both succeed.
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_wallets_email ON wallets (email) WHERE email IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_wallets_phone_number ON wallets (phone_number) WHERE phone_number IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE wallet_balances (
        wallet_id   UUID          NOT NULL REFERENCES wallets (id) ON DELETE CASCADE,
        currency    TEXT          NOT NULL CHECK (currency IN ${CURRENCY_CHECK}),
        amount      NUMERIC(38,6) NOT NULL DEFAULT 0,
        version     INTEGER       NOT NULL DEFAULT 0,
        updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
        PRIMARY KEY (wallet_id, currency),
        -- Last line of defence: a balance can never go negative, even if
        -- application logic were bypassed.
        CONSTRAINT chk_wallet_balances_non_negative CHECK (amount >= 0)
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE wallet_balances`);
    await queryRunner.query(`DROP TABLE wallets`);
  }
}
