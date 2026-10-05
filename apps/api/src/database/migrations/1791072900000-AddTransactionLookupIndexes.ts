import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Stage 12 — index for ledger reads of soft-deleted rows, which the existing partial indexes
 * (`WHERE deleted_at IS NULL`) cannot serve; without it they are full-table scans once the table
 * holds many households (checked with EXPLAIN). It serves the "Excluídas" list (newest first) and
 * restoring an installment plan (expenses deleted at the plan's deletion instant).
 */
export class AddTransactionLookupIndexes1791072900000 implements MigrationInterface {
  name = 'AddTransactionLookupIndexes1791072900000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "ix_transactions_household_deleted" ON "transactions" ("household_id", "date" DESC, "id" DESC) WHERE "deleted_at" IS NOT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "ix_transactions_household_deleted"`);
  }
}
