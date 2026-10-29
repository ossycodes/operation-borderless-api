import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFxRateSnapshots1793260000000 implements MigrationInterface {
  name = 'CreateFxRateSnapshots1793260000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE fx_rate_snapshots (
        id          BIGSERIAL PRIMARY KEY,
        provider    TEXT        NOT NULL,
        rates       JSONB       NOT NULL,
        as_of       TIMESTAMPTZ NOT NULL,
        fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_fx_rate_snapshots_fetched_at ON fx_rate_snapshots (fetched_at DESC)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE fx_rate_snapshots`);
  }
}
