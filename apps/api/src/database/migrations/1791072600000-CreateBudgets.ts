import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Stage 08 — monthly budgets (FR-BUD-01..04, docs/architecture/ERD.md).
 *
 * A budget line is the household total (category_id NULL) or one category. Its periods are whole
 * months [from_month, until_month) stored as first days of months; the exclusion constraint keeps
 * the periods of a line from overlapping.
 */
export class CreateBudgets1791072600000 implements MigrationInterface {
  name = 'CreateBudgets1791072600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "budgets" (
        "id" uuid NOT NULL,
        "household_id" uuid NOT NULL,
        "category_id" uuid,
        "amount_cents" bigint NOT NULL,
        "from_month" date NOT NULL,
        "until_month" date,
        "created_by_member_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "deleted_by_member_id" uuid,
        CONSTRAINT "pk_budgets" PRIMARY KEY ("id"),
        CONSTRAINT "ck_budgets_amount" CHECK (amount_cents > 0 AND amount_cents <= 99999999999),
        CONSTRAINT "ck_budgets_months"
          CHECK (extract(day FROM from_month) = 1
            AND (until_month IS NULL OR (extract(day FROM until_month) = 1 AND until_month > from_month))),
        CONSTRAINT "ex_budgets_no_overlap" EXCLUDE USING gist (
          "household_id" WITH =,
          (COALESCE("category_id", '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
          daterange("from_month", "until_month") WITH &&
        ) WHERE ("deleted_at" IS NULL),
        CONSTRAINT "fk_budgets_household" FOREIGN KEY ("household_id")
          REFERENCES "households"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "fk_budgets_category" FOREIGN KEY ("category_id")
          REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "fk_budgets_created_by" FOREIGN KEY ("created_by_member_id")
          REFERENCES "household_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_budgets_household" ON "budgets" ("household_id", "from_month")
        WHERE deleted_at IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "budgets"`);
  }
}
