import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Stage 11 — per-user dismissals of deterministic insights (FR-INS-04, ADR-009, ADR-017).
 * Insights are never stored; only the fingerprint (rule + period + subject) a user dismissed.
 */
export class CreateInsightDismissals1791072800000 implements MigrationInterface {
  name = 'CreateInsightDismissals1791072800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "insight_dismissals" (
        "household_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "fingerprint" text NOT NULL,
        "dismissed_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "pk_insight_dismissals" PRIMARY KEY ("household_id", "user_id", "fingerprint"),
        CONSTRAINT "ck_insight_dismissals_fingerprint_length" CHECK (char_length(fingerprint) BETWEEN 1 AND 120),
        CONSTRAINT "fk_insight_dismissals_household" FOREIGN KEY ("household_id")
          REFERENCES "households"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "fk_insight_dismissals_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "insight_dismissals"`);
  }
}
