import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Stage 07 — recurring expenses and installment plans (ADR-007, docs/architecture/ERD.md).
 *
 * Origin columns on `transactions` have no foreign keys on purpose: the ledger must not depend
 * on the commitments modules (MODULES.md dependency direction). The commitment services write
 * both sides in one database transaction, and the partial unique indexes below make duplicate
 * materialization impossible.
 */
export class CreateCommitments1791072500000 implements MigrationInterface {
  name = 'CreateCommitments1791072500000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "recurring_expenses" (
        "id" uuid NOT NULL,
        "household_id" uuid NOT NULL,
        "description" text NOT NULL,
        "category_id" uuid NOT NULL,
        "expected_amount_cents" bigint NOT NULL,
        "amount_type" text NOT NULL,
        "frequency" text NOT NULL,
        "interval" integer NOT NULL,
        "start_date" date NOT NULL,
        "end_date" date,
        "payer_member_id" uuid NOT NULL,
        "payment_method" text NOT NULL,
        "split_rule" jsonb,
        "notes" text,
        "pauses" jsonb NOT NULL DEFAULT '[]',
        "created_by_member_id" uuid NOT NULL,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "deleted_by_member_id" uuid,
        CONSTRAINT "pk_recurring_expenses" PRIMARY KEY ("id"),
        CONSTRAINT "ck_recurring_expenses_amount"
          CHECK (expected_amount_cents > 0 AND expected_amount_cents <= 99999999999),
        CONSTRAINT "ck_recurring_expenses_description_length"
          CHECK (char_length(description) BETWEEN 1 AND 120),
        CONSTRAINT "ck_recurring_expenses_notes_length"
          CHECK (notes IS NULL OR char_length(notes) <= 500),
        CONSTRAINT "ck_recurring_expenses_amount_type" CHECK (amount_type IN ('FIXED', 'VARIABLE')),
        CONSTRAINT "ck_recurring_expenses_frequency"
          CHECK (frequency IN ('WEEKLY', 'MONTHLY', 'YEARLY')),
        CONSTRAINT "ck_recurring_expenses_interval" CHECK ("interval" BETWEEN 1 AND 12),
        CONSTRAINT "ck_recurring_expenses_period" CHECK (end_date IS NULL OR end_date >= start_date),
        CONSTRAINT "ck_recurring_expenses_payment_method"
          CHECK (payment_method IN ('PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'CASH', 'BANK_TRANSFER', 'BOLETO', 'OTHER')),
        CONSTRAINT "fk_recurring_expenses_household" FOREIGN KEY ("household_id")
          REFERENCES "households"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "fk_recurring_expenses_category" FOREIGN KEY ("category_id")
          REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "fk_recurring_expenses_payer" FOREIGN KEY ("payer_member_id")
          REFERENCES "household_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "fk_recurring_expenses_created_by" FOREIGN KEY ("created_by_member_id")
          REFERENCES "household_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_recurring_expenses_household" ON "recurring_expenses" ("household_id")
        WHERE deleted_at IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "recurring_occurrence_skips" (
        "id" uuid NOT NULL,
        "recurring_expense_id" uuid NOT NULL,
        "occurrence_date" date NOT NULL,
        "created_by_member_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_recurring_occurrence_skips" PRIMARY KEY ("id"),
        CONSTRAINT "uq_recurring_occurrence_skips" UNIQUE ("recurring_expense_id", "occurrence_date"),
        CONSTRAINT "fk_recurring_occurrence_skips_recurring" FOREIGN KEY ("recurring_expense_id")
          REFERENCES "recurring_expenses"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "fk_recurring_occurrence_skips_created_by" FOREIGN KEY ("created_by_member_id")
          REFERENCES "household_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "installment_plans" (
        "id" uuid NOT NULL,
        "household_id" uuid NOT NULL,
        "description" text NOT NULL,
        "category_id" uuid NOT NULL,
        "original_total_cents" bigint NOT NULL,
        "installment_count" integer NOT NULL,
        "first_installment_date" date NOT NULL,
        "payer_member_id" uuid NOT NULL,
        "payment_method" text NOT NULL,
        "split_snapshot" jsonb NOT NULL,
        "notes" text,
        "created_by_member_id" uuid NOT NULL,
        "close_kind" text,
        "closed_at" TIMESTAMP WITH TIME ZONE,
        "closed_by_member_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "deleted_by_member_id" uuid,
        CONSTRAINT "pk_installment_plans" PRIMARY KEY ("id"),
        CONSTRAINT "ck_installment_plans_total"
          CHECK (original_total_cents > 0 AND original_total_cents <= 99999999999),
        CONSTRAINT "ck_installment_plans_count" CHECK (installment_count BETWEEN 2 AND 72),
        CONSTRAINT "ck_installment_plans_description_length"
          CHECK (char_length(description) BETWEEN 1 AND 120),
        CONSTRAINT "ck_installment_plans_notes_length"
          CHECK (notes IS NULL OR char_length(notes) <= 500),
        CONSTRAINT "ck_installment_plans_payment_method"
          CHECK (payment_method IN ('PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'CASH', 'BANK_TRANSFER', 'BOLETO', 'OTHER')),
        CONSTRAINT "ck_installment_plans_close"
          CHECK ((close_kind IS NULL) = (closed_at IS NULL) AND (close_kind IS NULL OR close_kind IN ('CANCEL', 'PAY_OFF'))),
        CONSTRAINT "fk_installment_plans_household" FOREIGN KEY ("household_id")
          REFERENCES "households"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "fk_installment_plans_category" FOREIGN KEY ("category_id")
          REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "fk_installment_plans_payer" FOREIGN KEY ("payer_member_id")
          REFERENCES "household_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "fk_installment_plans_created_by" FOREIGN KEY ("created_by_member_id")
          REFERENCES "household_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_installment_plans_household" ON "installment_plans" ("household_id")
        WHERE deleted_at IS NULL
    `);

    // --- origin of an expense (ADR-007) ---------------------------------------------------------
    await queryRunner.query(`
      ALTER TABLE "transactions"
        ADD "recurring_expense_id" uuid,
        ADD "occurrence_date" date,
        ADD "installment_plan_id" uuid,
        ADD "installment_number" integer,
        ADD "installment_count" integer,
        ADD "installment_payoff" boolean NOT NULL DEFAULT false,
        ADD CONSTRAINT "ck_transactions_recurring_origin"
          CHECK ((recurring_expense_id IS NULL) = (occurrence_date IS NULL)),
        ADD CONSTRAINT "ck_transactions_installment_origin"
          CHECK ((installment_plan_id IS NULL) = (installment_number IS NULL)
            AND (installment_plan_id IS NULL) = (installment_count IS NULL)
            AND (installment_plan_id IS NOT NULL OR NOT installment_payoff)
            AND (installment_number IS NULL OR installment_number BETWEEN 1 AND installment_count)),
        ADD CONSTRAINT "ck_transactions_single_origin"
          CHECK (recurring_expense_id IS NULL OR installment_plan_id IS NULL)
    `);
    // An occurrence or an installment number has at most one live expense (FR-REC-03).
    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_transactions_recurring_occurrence" ON "transactions"
        ("recurring_expense_id", "occurrence_date")
        WHERE deleted_at IS NULL AND recurring_expense_id IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_transactions_installment" ON "transactions"
        ("installment_plan_id", "installment_number")
        WHERE deleted_at IS NULL AND installment_plan_id IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "ux_transactions_installment"`);
    await queryRunner.query(`DROP INDEX "ux_transactions_recurring_occurrence"`);
    await queryRunner.query(`
      ALTER TABLE "transactions"
        DROP CONSTRAINT "ck_transactions_single_origin",
        DROP CONSTRAINT "ck_transactions_installment_origin",
        DROP CONSTRAINT "ck_transactions_recurring_origin",
        DROP COLUMN "installment_payoff",
        DROP COLUMN "installment_count",
        DROP COLUMN "installment_number",
        DROP COLUMN "installment_plan_id",
        DROP COLUMN "occurrence_date",
        DROP COLUMN "recurring_expense_id"
    `);
    await queryRunner.query(`DROP TABLE "installment_plans"`);
    await queryRunner.query(`DROP TABLE "recurring_occurrence_skips"`);
    await queryRunner.query(`DROP TABLE "recurring_expenses"`);
  }
}
