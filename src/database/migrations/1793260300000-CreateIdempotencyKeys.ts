import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIdempotencyKeys1793260300000 implements MigrationInterface {
  name = 'CreateIdempotencyKeys1793260300000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE idempotency_keys (
        scope            TEXT        NOT NULL,
        key              TEXT        NOT NULL,
        request_hash     TEXT        NOT NULL,
        response_status  INTEGER,
        response_body    JSONB,
        transaction_id   UUID        REFERENCES transactions (id),
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT pk_idempotency_keys PRIMARY KEY (scope, key)
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE idempotency_keys`);
  }
}
