import { MigrationInterface, QueryRunner } from 'typeorm';

/** Supports the expiry purge (`WHERE created_at < now() - ttl`). */
export class IndexIdempotencyKeysCreatedAt1793260400000 implements MigrationInterface {
  name = 'IndexIdempotencyKeysCreatedAt1793260400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX idx_idempotency_keys_created_at ON idempotency_keys (created_at)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX idx_idempotency_keys_created_at`);
  }
}
