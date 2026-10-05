import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Stage 03 — identity tables (docs/architecture/ERD.md, ADR-004).
 * Refresh tokens are stored only as SHA-256 hashes.
 */
export class CreateUsersAndRefreshTokens1791072100000 implements MigrationInterface {
  name = 'CreateUsersAndRefreshTokens1791072100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL,
        "email" citext NOT NULL,
        "password_hash" text NOT NULL,
        "display_name" text NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_users" PRIMARY KEY ("id"),
        CONSTRAINT "uq_users_email" UNIQUE ("email"),
        CONSTRAINT "ck_users_display_name_length"
          CHECK (char_length(display_name) BETWEEN 1 AND 60)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "family_id" uuid NOT NULL,
        "token_hash" character(64) NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "rotated_at" TIMESTAMP WITH TIME ZONE,
        "replaced_by_id" uuid,
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        "revoked_reason" text,
        CONSTRAINT "pk_refresh_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "uq_refresh_tokens_token_hash" UNIQUE ("token_hash"),
        CONSTRAINT "ck_refresh_tokens_revoked_reason"
          CHECK (revoked_reason IN ('LOGOUT', 'REUSE_DETECTED')),
        CONSTRAINT "fk_refresh_tokens_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_refresh_tokens_family_id" ON "refresh_tokens" ("family_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_refresh_tokens_user_id" ON "refresh_tokens" ("user_id")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
