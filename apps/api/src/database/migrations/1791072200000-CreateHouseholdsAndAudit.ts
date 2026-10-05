import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Stage 04 — households, membership, invitations and the audit trail
 * (docs/architecture/ERD.md, ADR-005, ADR-008).
 */
export class CreateHouseholdsAndAudit1791072200000 implements MigrationInterface {
  name = 'CreateHouseholdsAndAudit1791072200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "households" (
        "id" uuid NOT NULL,
        "name" text NOT NULL,
        "currency" character(3) NOT NULL,
        "timezone" text NOT NULL,
        "default_split_type" text NOT NULL,
        "default_split_weights" jsonb,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "archived_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_households" PRIMARY KEY ("id"),
        CONSTRAINT "ck_households_name_length" CHECK (char_length(name) BETWEEN 1 AND 60),
        CONSTRAINT "ck_households_currency" CHECK (currency IN ('BRL', 'USD', 'EUR')),
        CONSTRAINT "ck_households_default_split_type"
          CHECK (default_split_type IN ('EQUAL', 'INCOME_PROPORTIONAL', 'CUSTOM_PERCENT'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "household_members" (
        "id" uuid NOT NULL,
        "household_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "role" text NOT NULL,
        "status" text NOT NULL,
        "income_visibility" text NOT NULL DEFAULT 'RATIO_ONLY',
        "joined_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "left_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_household_members" PRIMARY KEY ("id"),
        CONSTRAINT "ck_household_members_role" CHECK (role IN ('OWNER', 'MEMBER')),
        CONSTRAINT "ck_household_members_status" CHECK (status IN ('ACTIVE', 'LEFT', 'REMOVED')),
        CONSTRAINT "ck_household_members_income_visibility"
          CHECK (income_visibility IN ('EXACT', 'RATIO_ONLY')),
        CONSTRAINT "fk_household_members_household" FOREIGN KEY ("household_id")
          REFERENCES "households"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "fk_household_members_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    // One active membership per user and household; at most one active owner (ADR-005).
    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_household_members_active_user"
        ON "household_members" ("household_id", "user_id") WHERE status = 'ACTIVE'
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_household_members_active_owner"
        ON "household_members" ("household_id") WHERE role = 'OWNER' AND status = 'ACTIVE'
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_household_members_user_active"
        ON "household_members" ("user_id") WHERE status = 'ACTIVE'
    `);

    await queryRunner.query(`
      CREATE TABLE "household_invitations" (
        "id" uuid NOT NULL,
        "household_id" uuid NOT NULL,
        "email" citext NOT NULL,
        "token_hash" character(64) NOT NULL,
        "invited_by_member_id" uuid NOT NULL,
        "status" text NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "accepted_by_user_id" uuid,
        "accepted_at" TIMESTAMP WITH TIME ZONE,
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_household_invitations" PRIMARY KEY ("id"),
        CONSTRAINT "uq_household_invitations_token_hash" UNIQUE ("token_hash"),
        CONSTRAINT "ck_household_invitations_status"
          CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED')),
        CONSTRAINT "fk_household_invitations_household" FOREIGN KEY ("household_id")
          REFERENCES "households"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "fk_household_invitations_invited_by" FOREIGN KEY ("invited_by_member_id")
          REFERENCES "household_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "fk_household_invitations_accepted_by" FOREIGN KEY ("accepted_by_user_id")
          REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_household_invitations_pending_email"
        ON "household_invitations" ("household_id", "email") WHERE status = 'PENDING'
    `);

    await queryRunner.query(`
      CREATE TABLE "audit_events" (
        "id" uuid NOT NULL,
        "household_id" uuid,
        "actor_user_id" uuid NOT NULL,
        "entity_type" text NOT NULL,
        "entity_id" uuid NOT NULL,
        "action" text NOT NULL,
        "before" jsonb,
        "after" jsonb,
        "request_id" text,
        "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "pk_audit_events" PRIMARY KEY ("id"),
        CONSTRAINT "ck_audit_events_action"
          CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'RECALCULATE'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_audit_events_entity"
        ON "audit_events" ("household_id", "entity_type", "entity_id", "occurred_at")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "audit_events"`);
    await queryRunner.query(`DROP TABLE "household_invitations"`);
    await queryRunner.query(`DROP TABLE "household_members"`);
    await queryRunner.query(`DROP TABLE "households"`);
  }
}
