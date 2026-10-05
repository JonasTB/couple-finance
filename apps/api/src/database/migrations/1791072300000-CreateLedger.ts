import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Stage 05 — categories, income records, transactions and allocations
 * (docs/architecture/ERD.md, ADR-002, ADR-006).
 *
 * The default category list is copied here on purpose: a migration is a snapshot and must not
 * change when the application's seed list evolves.
 */
const DEFAULT_CATEGORIES: [string, string[]][] = [
  [
    'Moradia',
    [
      'Aluguel ou financiamento',
      'Condomínio',
      'Energia',
      'Água',
      'Gás',
      'Internet e telefone',
      'Manutenção',
    ],
  ],
  ['Mercado', ['Supermercado', 'Feira e hortifrúti', 'Padaria']],
  ['Alimentação fora', ['Restaurantes', 'Delivery', 'Café e lanches']],
  [
    'Transporte',
    [
      'Combustível',
      'Transporte público',
      'Aplicativos de transporte',
      'Estacionamento e pedágio',
      'Manutenção do veículo',
    ],
  ],
  ['Saúde', ['Plano de saúde', 'Farmácia', 'Consultas e exames']],
  ['Educação', ['Cursos', 'Livros e material']],
  ['Lazer', ['Viagens', 'Passeios e eventos', 'Hobbies']],
  ['Assinaturas', ['Streaming', 'Apps e serviços', 'Academia']],
  ['Casa e decoração', ['Móveis', 'Eletrodomésticos', 'Utensílios']],
  ['Pets', ['Alimentação do pet', 'Veterinário']],
  ['Cuidados pessoais', ['Roupas e calçados', 'Beleza e higiene']],
  ['Impostos e taxas', ['IPTU', 'IPVA', 'Tarifas bancárias']],
  ['Presentes e doações', []],
  ['Outros', []],
];

export class CreateLedger1791072300000 implements MigrationInterface {
  name = 'CreateLedger1791072300000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // --- categories ---------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "categories" (
        "id" uuid NOT NULL,
        "household_id" uuid NOT NULL,
        "parent_id" uuid,
        "name" text NOT NULL,
        "is_system" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "archived_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_categories" PRIMARY KEY ("id"),
        CONSTRAINT "ck_categories_name_length" CHECK (char_length(name) BETWEEN 1 AND 40),
        CONSTRAINT "fk_categories_household" FOREIGN KEY ("household_id")
          REFERENCES "households"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "fk_categories_parent" FOREIGN KEY ("parent_id")
          REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_categories_household" ON "categories" ("household_id")`,
    );
    // Names are unique per (household, parent), case-insensitively, among non-archived categories.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "ux_categories_name" ON "categories"
        ("household_id", COALESCE("parent_id", '00000000-0000-0000-0000-000000000000'::uuid), lower("name"))
        WHERE archived_at IS NULL
    `);

    // Seed defaults for households created before this migration.
    for (const [parent, children] of DEFAULT_CATEGORIES) {
      await queryRunner.query(
        `INSERT INTO categories (id, household_id, parent_id, name, is_system)
         SELECT gen_random_uuid(), h.id, NULL, $1, true FROM households h`,
        [parent],
      );
      for (const child of children) {
        await queryRunner.query(
          `INSERT INTO categories (id, household_id, parent_id, name, is_system)
           SELECT gen_random_uuid(), p.household_id, p.id, $2, true
           FROM categories p WHERE p.parent_id IS NULL AND p.name = $1 AND p.is_system`,
          [parent, child],
        );
      }
    }

    // --- income_records -----------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "income_records" (
        "id" uuid NOT NULL,
        "household_id" uuid NOT NULL,
        "member_id" uuid NOT NULL,
        "monthly_amount_cents" bigint NOT NULL,
        "effective_from" date NOT NULL,
        "effective_to" date,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_income_records" PRIMARY KEY ("id"),
        CONSTRAINT "ck_income_records_amount"
          CHECK (monthly_amount_cents > 0 AND monthly_amount_cents <= 99999999999),
        CONSTRAINT "ck_income_records_period"
          CHECK (effective_to IS NULL OR effective_to > effective_from),
        CONSTRAINT "fk_income_records_household" FOREIGN KEY ("household_id")
          REFERENCES "households"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "fk_income_records_member" FOREIGN KEY ("member_id")
          REFERENCES "household_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "ex_income_records_no_overlap" EXCLUDE USING gist
          ("member_id" WITH =, daterange("effective_from", "effective_to") WITH &&)
          WHERE ("deleted_at" IS NULL)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_income_records_member" ON "income_records" ("member_id", "effective_from")`,
    );

    // --- transactions -------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "transactions" (
        "id" uuid NOT NULL,
        "household_id" uuid NOT NULL,
        "description" text NOT NULL,
        "amount_cents" bigint NOT NULL,
        "date" date NOT NULL,
        "category_id" uuid NOT NULL,
        "payer_member_id" uuid NOT NULL,
        "payment_method" text NOT NULL,
        "notes" text,
        "tags" text array NOT NULL DEFAULT '{}',
        "split_type" text NOT NULL,
        "split_snapshot" jsonb NOT NULL,
        "created_by_member_id" uuid NOT NULL,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "deleted_by_member_id" uuid,
        CONSTRAINT "pk_transactions" PRIMARY KEY ("id"),
        CONSTRAINT "ck_transactions_amount" CHECK (amount_cents > 0 AND amount_cents <= 99999999999),
        CONSTRAINT "ck_transactions_description_length" CHECK (char_length(description) BETWEEN 1 AND 120),
        CONSTRAINT "ck_transactions_notes_length" CHECK (notes IS NULL OR char_length(notes) <= 500),
        CONSTRAINT "ck_transactions_tags" CHECK (cardinality(tags) <= 10),
        CONSTRAINT "ck_transactions_split_type"
          CHECK (split_type IN ('EQUAL', 'INCOME_PROPORTIONAL', 'CUSTOM_PERCENT', 'CUSTOM_AMOUNT', 'INDIVIDUAL')),
        CONSTRAINT "ck_transactions_payment_method"
          CHECK (payment_method IN ('PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'CASH', 'BANK_TRANSFER', 'BOLETO', 'OTHER')),
        CONSTRAINT "fk_transactions_household" FOREIGN KEY ("household_id")
          REFERENCES "households"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "fk_transactions_category" FOREIGN KEY ("category_id")
          REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "fk_transactions_payer" FOREIGN KEY ("payer_member_id")
          REFERENCES "household_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "fk_transactions_created_by" FOREIGN KEY ("created_by_member_id")
          REFERENCES "household_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    // List + cursor pagination and monthly aggregates (ERD "Initial indexes").
    await queryRunner.query(`
      CREATE INDEX "ix_transactions_household_date" ON "transactions"
        ("household_id", "date" DESC, "id" DESC) WHERE deleted_at IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_transactions_household_category" ON "transactions"
        ("household_id", "category_id", "date") WHERE deleted_at IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "transaction_allocations" (
        "id" uuid NOT NULL,
        "transaction_id" uuid NOT NULL,
        "member_id" uuid NOT NULL,
        "amount_cents" bigint NOT NULL,
        "weight" bigint NOT NULL,
        CONSTRAINT "pk_transaction_allocations" PRIMARY KEY ("id"),
        CONSTRAINT "uq_transaction_allocations_member" UNIQUE ("transaction_id", "member_id"),
        CONSTRAINT "ck_transaction_allocations_amount" CHECK (amount_cents >= 0),
        CONSTRAINT "fk_transaction_allocations_transaction" FOREIGN KEY ("transaction_id")
          REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "fk_transaction_allocations_member" FOREIGN KEY ("member_id")
          REFERENCES "household_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_transaction_allocations_member" ON "transaction_allocations" ("member_id")`,
    );

    // Defense in depth (ADR-006): at commit, allocations must add up to the amount exactly.
    await queryRunner.query(`
      CREATE FUNCTION assert_allocations_balance() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE
        tx_id uuid;
        expected bigint;
        actual bigint;
      BEGIN
        IF TG_TABLE_NAME = 'transactions' THEN
          tx_id := NEW.id;
        ELSIF TG_OP = 'DELETE' THEN
          tx_id := OLD.transaction_id;
        ELSE
          tx_id := NEW.transaction_id;
        END IF;
        SELECT amount_cents INTO expected FROM transactions WHERE id = tx_id;
        IF expected IS NULL THEN
          RETURN NULL; -- the transaction itself is gone (cascade)
        END IF;
        SELECT COALESCE(SUM(amount_cents), 0) INTO actual
          FROM transaction_allocations WHERE transaction_id = tx_id;
        IF actual <> expected THEN
          RAISE EXCEPTION 'allocations (%) do not add up to the transaction amount (%) for %',
            actual, expected, tx_id USING ERRCODE = 'check_violation';
        END IF;
        RETURN NULL;
      END
      $$
    `);
    await queryRunner.query(`
      CREATE CONSTRAINT TRIGGER "trg_transaction_allocations_balance"
        AFTER INSERT OR UPDATE OR DELETE ON "transaction_allocations"
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION assert_allocations_balance()
    `);
    await queryRunner.query(`
      CREATE CONSTRAINT TRIGGER "trg_transactions_balance"
        AFTER INSERT OR UPDATE OF amount_cents ON "transactions"
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION assert_allocations_balance()
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "transaction_allocations"`);
    await queryRunner.query(`DROP TABLE "transactions"`);
    await queryRunner.query(`DROP FUNCTION assert_allocations_balance()`);
    await queryRunner.query(`DROP TABLE "income_records"`);
    await queryRunner.query(`DROP TABLE "categories"`);
  }
}
