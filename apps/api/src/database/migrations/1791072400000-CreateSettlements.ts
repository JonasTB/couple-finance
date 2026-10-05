import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Stage 06 — settlements ("acertos", Q-01): out-of-app transfers between members that adjust
 * contribution balances (docs/architecture/ERD.md, docs/domain/CALCULATIONS.md §3).
 */
export class CreateSettlements1791072400000 implements MigrationInterface {
  name = 'CreateSettlements1791072400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "settlements" (
        "id" uuid NOT NULL,
        "household_id" uuid NOT NULL,
        "from_member_id" uuid NOT NULL,
        "to_member_id" uuid NOT NULL,
        "amount_cents" bigint NOT NULL,
        "date" date NOT NULL,
        "notes" text,
        "created_by_member_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "deleted_by_member_id" uuid,
        CONSTRAINT "pk_settlements" PRIMARY KEY ("id"),
        CONSTRAINT "ck_settlements_amount" CHECK (amount_cents > 0 AND amount_cents <= 99999999999),
        CONSTRAINT "ck_settlements_distinct_members" CHECK (from_member_id <> to_member_id),
        CONSTRAINT "ck_settlements_notes_length" CHECK (notes IS NULL OR char_length(notes) <= 200),
        CONSTRAINT "fk_settlements_household" FOREIGN KEY ("household_id")
          REFERENCES "households"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "fk_settlements_from_member" FOREIGN KEY ("from_member_id")
          REFERENCES "household_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "fk_settlements_to_member" FOREIGN KEY ("to_member_id")
          REFERENCES "household_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "fk_settlements_created_by" FOREIGN KEY ("created_by_member_id")
          REFERENCES "household_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    // Monthly listing and cumulative balance (date <= end of month).
    await queryRunner.query(`
      CREATE INDEX "ix_settlements_household_date" ON "settlements"
        ("household_id", "date" DESC) WHERE deleted_at IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "settlements"`);
  }
}
