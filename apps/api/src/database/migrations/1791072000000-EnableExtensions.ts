import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Baseline extensions required by the ERD (docs/architecture/ERD.md):
 * - citext: case-insensitive emails (users, invitations)
 * - btree_gist: exclusion constraints for non-overlapping income/budget periods
 */
export class EnableExtensions1791072000000 implements MigrationInterface {
  name = 'EnableExtensions1791072000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS citext');
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS btree_gist');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP EXTENSION IF EXISTS btree_gist');
    await queryRunner.query('DROP EXTENSION IF EXISTS citext');
  }
}
