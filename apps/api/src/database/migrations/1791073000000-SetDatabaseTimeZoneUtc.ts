import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Stage 13 — the database's default session time zone is UTC (ADR-003), set on the database
 * itself instead of a connection startup parameter, which connection poolers such as Neon's
 * PgBouncer do not accept. Applies to new sessions; no query depends on it (dates are
 * `YYYY-MM-DD`, instants are timestamptz).
 */
export class SetDatabaseTimeZoneUtc1791073000000 implements MigrationInterface {
  name = 'SetDatabaseTimeZoneUtc1791073000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'UTC'); END $$`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN EXECUTE format('ALTER DATABASE %I RESET timezone', current_database()); END $$`,
    );
  }
}
