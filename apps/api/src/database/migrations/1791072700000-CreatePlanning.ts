import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Stage 09 — goals with contributions/withdrawals and purchase plans with items
 * (FR-GOAL-01..03, FR-PP-01..04, docs/architecture/ERD.md). Bookkeeping only.
 */
export class CreatePlanning1791072700000 implements MigrationInterface {
  name = 'CreatePlanning1791072700000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "goals" (
        "id" uuid NOT NULL,
        "household_id" uuid NOT NULL,
        "name" text NOT NULL,
        "target_amount_cents" bigint NOT NULL,
        "target_date" date,
        "participant_member_ids" uuid array NOT NULL,
        "created_by_member_id" uuid NOT NULL,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "archived_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_goals" PRIMARY KEY ("id"),
        CONSTRAINT "ck_goals_name_length" CHECK (char_length(name) BETWEEN 1 AND 60),
        CONSTRAINT "ck_goals_target" CHECK (target_amount_cents > 0 AND target_amount_cents <= 99999999999),
        CONSTRAINT "ck_goals_participants" CHECK (cardinality(participant_member_ids) >= 1),
        CONSTRAINT "fk_goals_household" FOREIGN KEY ("household_id")
          REFERENCES "households"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "fk_goals_created_by" FOREIGN KEY ("created_by_member_id")
          REFERENCES "household_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX "ix_goals_household" ON "goals" ("household_id")`);

    await queryRunner.query(`
      CREATE TABLE "goal_contributions" (
        "id" uuid NOT NULL,
        "goal_id" uuid NOT NULL,
        "member_id" uuid NOT NULL,
        "type" text NOT NULL,
        "amount_cents" bigint NOT NULL,
        "date" date NOT NULL,
        "notes" text,
        "created_by_member_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "deleted_by_member_id" uuid,
        CONSTRAINT "pk_goal_contributions" PRIMARY KEY ("id"),
        CONSTRAINT "ck_goal_contributions_type" CHECK (type IN ('CONTRIBUTION', 'WITHDRAWAL')),
        CONSTRAINT "ck_goal_contributions_amount" CHECK (amount_cents > 0 AND amount_cents <= 99999999999),
        CONSTRAINT "ck_goal_contributions_notes_length" CHECK (notes IS NULL OR char_length(notes) <= 200),
        CONSTRAINT "fk_goal_contributions_goal" FOREIGN KEY ("goal_id")
          REFERENCES "goals"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "fk_goal_contributions_member" FOREIGN KEY ("member_id")
          REFERENCES "household_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "fk_goal_contributions_created_by" FOREIGN KEY ("created_by_member_id")
          REFERENCES "household_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_goal_contributions_goal" ON "goal_contributions" ("goal_id", "date")`,
    );

    await queryRunner.query(`
      CREATE TABLE "purchase_plans" (
        "id" uuid NOT NULL,
        "household_id" uuid NOT NULL,
        "name" text NOT NULL,
        "description" text,
        "goal_id" uuid,
        "created_by_member_id" uuid NOT NULL,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "archived_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_purchase_plans" PRIMARY KEY ("id"),
        CONSTRAINT "ck_purchase_plans_name_length" CHECK (char_length(name) BETWEEN 1 AND 60),
        CONSTRAINT "ck_purchase_plans_description_length"
          CHECK (description IS NULL OR char_length(description) <= 500),
        CONSTRAINT "fk_purchase_plans_household" FOREIGN KEY ("household_id")
          REFERENCES "households"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "fk_purchase_plans_goal" FOREIGN KEY ("goal_id")
          REFERENCES "goals"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "fk_purchase_plans_created_by" FOREIGN KEY ("created_by_member_id")
          REFERENCES "household_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_purchase_plans_household" ON "purchase_plans" ("household_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "purchase_plan_items" (
        "id" uuid NOT NULL,
        "purchase_plan_id" uuid NOT NULL,
        "name" text NOT NULL,
        "estimated_price_cents" bigint NOT NULL,
        "quantity" integer NOT NULL,
        "priority" text NOT NULL,
        "status" text NOT NULL,
        "paid_price_cents" bigint,
        "purchased_at" date,
        "transaction_id" uuid,
        "responsible_member_id" uuid,
        "url" text,
        "notes" text,
        "created_by_member_id" uuid NOT NULL,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "deleted_by_member_id" uuid,
        CONSTRAINT "pk_purchase_plan_items" PRIMARY KEY ("id"),
        CONSTRAINT "ck_purchase_plan_items_name_length" CHECK (char_length(name) BETWEEN 1 AND 80),
        CONSTRAINT "ck_purchase_plan_items_estimate"
          CHECK (estimated_price_cents > 0 AND estimated_price_cents <= 99999999999),
        CONSTRAINT "ck_purchase_plan_items_quantity" CHECK (quantity BETWEEN 1 AND 999),
        CONSTRAINT "ck_purchase_plan_items_priority" CHECK (priority IN ('HIGH', 'MEDIUM', 'LOW')),
        CONSTRAINT "ck_purchase_plan_items_status" CHECK (status IN ('PENDING', 'PURCHASED', 'FUTURE')),
        CONSTRAINT "ck_purchase_plan_items_purchase"
          CHECK ((status = 'PURCHASED') = (paid_price_cents IS NOT NULL)
            AND (status = 'PURCHASED') = (purchased_at IS NOT NULL)
            AND (transaction_id IS NULL OR status = 'PURCHASED')
            AND (paid_price_cents IS NULL OR (paid_price_cents >= 0 AND paid_price_cents <= 99999999999))),
        CONSTRAINT "ck_purchase_plan_items_texts"
          CHECK ((url IS NULL OR char_length(url) <= 500) AND (notes IS NULL OR char_length(notes) <= 500)),
        CONSTRAINT "fk_purchase_plan_items_plan" FOREIGN KEY ("purchase_plan_id")
          REFERENCES "purchase_plans"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "fk_purchase_plan_items_transaction" FOREIGN KEY ("transaction_id")
          REFERENCES "transactions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "fk_purchase_plan_items_responsible" FOREIGN KEY ("responsible_member_id")
          REFERENCES "household_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "fk_purchase_plan_items_created_by" FOREIGN KEY ("created_by_member_id")
          REFERENCES "household_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_purchase_plan_items_plan" ON "purchase_plan_items" ("purchase_plan_id")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "purchase_plan_items"`);
    await queryRunner.query(`DROP TABLE "purchase_plans"`);
    await queryRunner.query(`DROP TABLE "goal_contributions"`);
    await queryRunner.query(`DROP TABLE "goals"`);
  }
}
