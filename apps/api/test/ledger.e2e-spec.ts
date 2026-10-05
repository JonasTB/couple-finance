import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { type App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { register, uniqueEmail } from './auth-helpers';
import { createTestApp } from './create-test-app';

interface TestUser {
  email: string;
  token: string;
}
interface Category {
  id: string;
  name: string;
  parentId: string | null;
  archived: boolean;
  children: Category[];
}
interface Transaction {
  id: string;
  amountCents: number;
  version: number;
  payerMemberId: string;
  split: {
    type: string;
    weights: { memberId: string; weight: number }[];
    incomeBasisDate?: string;
  };
  allocations: { memberId: string; amountCents: number }[];
  deletedAt: string | null;
  tags: string[];
}

describe('Categories, incomes and transactions (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let db: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
    db = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  const newUser = async (prefix: string): Promise<TestUser> => {
    const email = uniqueEmail(prefix);
    const { accessToken } = await register(server, { email });
    return { email, token: accessToken };
  };

  const api = (user: TestUser) => ({
    get: (path: string) =>
      request(server).get(`/api/v1${path}`).set('Authorization', `Bearer ${user.token}`),
    post: (path: string, body?: object) =>
      request(server)
        .post(`/api/v1${path}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send(body),
    patch: (path: string, body: object) =>
      request(server)
        .patch(`/api/v1${path}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send(body),
    delete: (path: string) =>
      request(server).delete(`/api/v1${path}`).set('Authorization', `Bearer ${user.token}`),
  });

  /** Owner Ana (joined first) + partner Bruno, with ids and the seeded categories. */
  const couple = async () => {
    const ana = await newUser('ana');
    const bruno = await newUser('bruno');
    const created = await api(ana).post('/households', { name: 'Casa' }).expect(201);
    const householdId = (created.body as { id: string; me: { memberId: string } }).id;
    const anaId = (created.body as { me: { memberId: string } }).me.memberId;
    const invite = await api(ana)
      .post(`/households/${householdId}/invitations`, { email: bruno.email })
      .expect(201);
    await api(bruno)
      .post('/invitations/accept', { token: (invite.body as { token: string }).token })
      .expect(200);
    const members = (await api(ana).get(`/households/${householdId}/members`).expect(200)).body as {
      id: string;
      isMe: boolean;
    }[];
    const brunoId = members.find((member) => !member.isMe)?.id ?? '';
    const categories = (await api(ana).get(`/households/${householdId}/categories`).expect(200))
      .body as Category[];
    const mercado = categories.find((c) => c.name === 'Mercado');
    const supermercado = mercado?.children.find((c) => c.name === 'Supermercado');
    const moradia = categories.find((c) => c.name === 'Moradia');
    return {
      ana,
      bruno,
      householdId,
      anaId,
      brunoId,
      categories,
      mercadoId: mercado?.id ?? '',
      supermercadoId: supermercado?.id ?? '',
      moradiaId: moradia?.id ?? '',
      tx: `/households/${householdId}/transactions`,
    };
  };

  const expense = (categoryId: string, payerMemberId: string, extra: object = {}) => ({
    description: 'Supermercado do mês',
    amountCents: 10001,
    date: '2026-03-10',
    categoryId,
    payerMemberId,
    paymentMethod: 'PIX',
    ...extra,
  });

  describe('categories', () => {
    it('seeds the default pt-BR tree into every new household', async () => {
      const { categories } = await couple();
      expect(categories.map((c) => c.name)).toEqual(
        expect.arrayContaining(['Moradia', 'Mercado', 'Transporte', 'Saúde', 'Outros']),
      );
      expect(categories).toHaveLength(14);
      expect(categories.find((c) => c.name === 'Moradia')?.children.map((c) => c.name)).toContain(
        'Condomínio',
      );
    });

    it('creates custom categories with unique names per level (case-insensitive)', async () => {
      const { ana, householdId, mercadoId } = await couple();
      const base = `/households/${householdId}/categories`;
      const created = await api(ana).post(base, { name: '  Bebê  ' }).expect(201);
      expect(created.body).toMatchObject({ name: 'Bebê', parentId: null, isSystem: false });
      const duplicate = await api(ana).post(base, { name: 'bebê' }).expect(409);
      expect(duplicate.body).toMatchObject({ error: { code: 'CATEGORY_NAME_TAKEN' } });

      const sub = await api(ana).post(base, { name: 'Bebê', parentId: mercadoId }).expect(201);
      // Two levels at most.
      await api(ana)
        .post(base, { name: 'Fraldas', parentId: (sub.body as Category).id })
        .expect(400);
    });

    it('archives a parent with its children; archived categories cannot be used', async () => {
      const { ana, householdId, mercadoId, supermercadoId, anaId, tx } = await couple();
      const base = `/households/${householdId}/categories`;
      await api(ana).patch(`${base}/${mercadoId}`, { archived: true }).expect(204);

      const visible = (await api(ana).get(base).expect(200)).body as Category[];
      expect(visible.find((c) => c.id === mercadoId)).toBeUndefined();
      const all = (await api(ana).get(`${base}?includeArchived=true`).expect(200))
        .body as Category[];
      expect(all.find((c) => c.id === mercadoId)?.children.every((c) => c.archived)).toBe(true);

      const rejected = await api(ana).post(tx, expense(supermercadoId, anaId)).expect(422);
      expect(rejected.body).toMatchObject({ error: { code: 'CATEGORY_ARCHIVED' } });
      // A child cannot come back while its parent is archived.
      await api(ana).patch(`${base}/${supermercadoId}`, { archived: false }).expect(400);
      await api(ana).patch(`${base}/${mercadoId}`, { archived: false }).expect(204);
      await api(ana).patch(`${base}/${supermercadoId}`, { archived: false }).expect(204);
      await api(ana).post(tx, expense(supermercadoId, anaId)).expect(201);
    });
  });

  describe('incomes and visibility (FR-INC, ADR-005)', () => {
    it('shows proportions to everyone but amounts only to their owner unless EXACT', async () => {
      const { ana, bruno, householdId, anaId, brunoId } = await couple();
      const base = `/households/${householdId}/incomes`;
      await api(ana)
        .post(`${base}/me`, { monthlyAmountCents: 600000, effectiveFrom: '2026-01-01' })
        .expect(201);
      await api(bruno)
        .post(`${base}/me`, { monthlyAmountCents: 400000, effectiveFrom: '2026-01-01' })
        .expect(201);

      const asAna = await api(ana).get(`${base}?date=2026-03-10`).expect(200);
      expect(asAna.body).toEqual({
        date: '2026-03-10',
        members: [
          {
            memberId: anaId,
            isMe: true,
            visibility: 'RATIO_ONLY',
            hasIncome: true,
            monthlyAmountCents: 600000,
            shareBps: 6000,
          },
          {
            memberId: brunoId,
            isMe: false,
            visibility: 'RATIO_ONLY',
            hasIncome: true,
            monthlyAmountCents: null,
            shareBps: 4000,
          },
        ],
      });

      await api(bruno)
        .patch(`/households/${householdId}/members/me`, { incomeVisibility: 'EXACT' })
        .expect(204);
      const after = await api(ana).get(`${base}?date=2026-03-10`).expect(200);
      expect(
        (after.body as { members: { monthlyAmountCents: number | null }[] }).members[1]
          ?.monthlyAmountCents,
      ).toBe(400000);
    });

    it('keeps an effective-dated history that only grows forward', async () => {
      const { ana, householdId } = await couple();
      const base = `/households/${householdId}/incomes/me`;
      await api(ana)
        .post(base, { monthlyAmountCents: 500000, effectiveFrom: '2026-01-01' })
        .expect(201);
      await api(ana)
        .post(base, { monthlyAmountCents: 550000, effectiveFrom: '2026-01-01' })
        .expect(201); // same date: corrects
      await api(ana)
        .post(base, { monthlyAmountCents: 700000, effectiveFrom: '2026-06-01' })
        .expect(201);
      await api(ana).post(base, { monthlyAmountCents: 1, effectiveFrom: '2026-02-01' }).expect(400); // before latest

      const history = (await api(ana).get(base).expect(200)).body as {
        id: string;
        effectiveTo: string | null;
      }[];
      expect(history).toEqual([
        expect.objectContaining({
          monthlyAmountCents: 700000,
          effectiveFrom: '2026-06-01',
          effectiveTo: null,
        }),
        expect.objectContaining({
          monthlyAmountCents: 550000,
          effectiveFrom: '2026-01-01',
          effectiveTo: '2026-06-01',
        }),
      ]);

      await api(ana)
        .delete(`${base}/${history[1]?.id ?? ''}`)
        .expect(400); // only the latest
      await api(ana)
        .delete(`${base}/${history[0]?.id ?? ''}`)
        .expect(204);
      expect((await api(ana).get(base).expect(200)).body).toEqual([
        expect.objectContaining({ monthlyAmountCents: 550000, effectiveTo: null }),
      ]);
    });

    it.each([
      [{ monthlyAmountCents: 0, effectiveFrom: '2026-01-01' }],
      [{ monthlyAmountCents: 10.5, effectiveFrom: '2026-01-01' }],
      [{ monthlyAmountCents: 1000, effectiveFrom: '2026-02-30' }],
    ])('rejects invalid income %j', async (body) => {
      const { ana, householdId } = await couple();
      await api(ana).post(`/households/${householdId}/incomes/me`, body).expect(400);
    });
  });

  describe('transactions and splits', () => {
    it('uses the household default (EQUAL); odd cents follow the stable member order', async () => {
      const { ana, supermercadoId, anaId, brunoId, tx, householdId } = await couple();
      const created = await api(ana)
        .post(
          tx,
          expense(supermercadoId, brunoId, { tags: [' feira ', 'Feira', 'mês'], notes: '  ' }),
        )
        .expect(201);
      expect(created.body).toMatchObject({
        amountCents: 10001,
        date: '2026-03-10',
        payerMemberId: brunoId,
        notes: null,
        tags: ['feira', 'mês'],
        split: { type: 'EQUAL' },
        allocations: [
          { memberId: anaId, amountCents: 5001 },
          { memberId: brunoId, amountCents: 5000 },
        ],
        version: 1,
        deletedAt: null,
      });
      const [audit] = await db.query<{ action: string }[]>(
        `SELECT action FROM audit_events WHERE household_id = $1 AND entity_type = 'TRANSACTION'`,
        [householdId],
      );
      expect(audit?.action).toBe('CREATE');
    });

    it('separates payer from responsibility (INDIVIDUAL paid by the partner)', async () => {
      const { ana, supermercadoId, anaId, brunoId, tx } = await couple();
      const created = await api(ana)
        .post(
          tx,
          expense(supermercadoId, anaId, {
            split: { type: 'INDIVIDUAL', responsibleMemberId: brunoId },
          }),
        )
        .expect(201);
      expect((created.body as Transaction).allocations).toEqual([
        { memberId: brunoId, amountCents: 10001 },
      ]);
    });

    it('splits by custom percentages and custom amounts', async () => {
      const { ana, supermercadoId, anaId, brunoId, tx } = await couple();
      const percent = await api(ana)
        .post(
          tx,
          expense(supermercadoId, anaId, {
            split: {
              type: 'CUSTOM_PERCENT',
              weights: [
                { memberId: brunoId, bps: 3000 },
                { memberId: anaId, bps: 7000 },
              ],
            },
          }),
        )
        .expect(201);
      expect((percent.body as Transaction).allocations).toEqual([
        { memberId: anaId, amountCents: 7001 },
        { memberId: brunoId, amountCents: 3000 },
      ]);

      const mismatch = await api(ana)
        .post(
          tx,
          expense(supermercadoId, anaId, {
            split: {
              type: 'CUSTOM_AMOUNT',
              amounts: [
                { memberId: anaId, amountCents: 5000 },
                { memberId: brunoId, amountCents: 5000 },
              ],
            },
          }),
        )
        .expect(422);
      expect(mismatch.body).toMatchObject({
        error: {
          code: 'SPLIT_SUM_MISMATCH',
          details: { expectedCents: 10001, actualCents: 10000 },
        },
      });

      await api(ana)
        .post(
          tx,
          expense(supermercadoId, anaId, {
            split: {
              type: 'CUSTOM_PERCENT',
              weights: [
                { memberId: anaId, bps: 6000 },
                { memberId: brunoId, bps: 3000 },
              ],
            },
          }),
        )
        .expect(400);
    });

    it.each([
      ['a non-integer amount', { amountCents: 100.5 }],
      ['a zero amount', { amountCents: 0 }],
      ['an amount above the cap', { amountCents: 100_000_000_000 }],
      ['an invalid date', { date: '2026-02-30' }],
      ['an unknown payment method', { paymentMethod: 'CRYPTO' }],
      ['too many tags', { tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }],
    ])('rejects %s', async (_label, override) => {
      const { ana, supermercadoId, anaId, tx } = await couple();
      await api(ana)
        .post(tx, expense(supermercadoId, anaId, override))
        .expect(400);
    });

    it('splits by income and preserves the historical basis (ADR-006)', async () => {
      const { ana, bruno, supermercadoId, anaId, brunoId, tx, householdId } = await couple();
      const incomes = `/households/${householdId}/incomes/me`;
      const proportional = expense(supermercadoId, anaId, {
        split: { type: 'INCOME_PROPORTIONAL' },
      });

      const missing = await api(ana).post(tx, proportional).expect(422);
      expect(missing.body).toMatchObject({ error: { code: 'INCOME_BASIS_MISSING' } });

      await api(ana)
        .post(incomes, { monthlyAmountCents: 600000, effectiveFrom: '2026-01-01' })
        .expect(201);
      await api(bruno)
        .post(incomes, { monthlyAmountCents: 400000, effectiveFrom: '2026-01-01' })
        .expect(201);
      const created = (await api(ana).post(tx, proportional).expect(201)).body as Transaction;
      expect(created.split).toEqual({
        type: 'INCOME_PROPORTIONAL',
        weights: [
          { memberId: anaId, weight: 6000 },
          { memberId: brunoId, weight: 4000 },
        ],
        incomeBasisDate: '2026-03-10',
      });
      expect(created.allocations).toEqual([
        { memberId: anaId, amountCents: 6001 },
        { memberId: brunoId, amountCents: 4000 },
      ]);
      // Raw incomes never reach the transaction (RATIO_ONLY privacy).
      const [stored] = await db.query<{ snapshot: string }[]>(
        `SELECT split_snapshot::text AS snapshot FROM transactions WHERE id = $1`,
        [created.id],
      );
      expect(stored?.snapshot).not.toContain('600000');

      // Bruno registers a raise retroactively (effective before the expense date).
      await api(bruno)
        .post(incomes, { monthlyAmountCents: 900000, effectiveFrom: '2026-03-01' })
        .expect(201);

      // Editing the amount re-applies the stored weights, not the new income.
      const edited = (
        await api(ana).patch(`${tx}/${created.id}`, { version: 1, amountCents: 20000 }).expect(200)
      ).body as Transaction;
      expect(edited.allocations).toEqual([
        { memberId: anaId, amountCents: 12000 },
        { memberId: brunoId, amountCents: 8000 },
      ]);

      // Explicit recalculation reads incomes on the transaction date: 6000 vs 9000 → 4000/6000 bps.
      const recalculated = (
        await api(ana).post(`${tx}/${created.id}/recalculate-split`).expect(200)
      ).body as Transaction;
      expect(recalculated.allocations).toEqual([
        { memberId: anaId, amountCents: 8000 },
        { memberId: brunoId, amountCents: 12000 },
      ]);
      const history = (await api(ana).get(`${tx}/${created.id}/history`).expect(200)).body as {
        action: string;
      }[];
      expect(history.map((entry) => entry.action)).toEqual(['CREATE', 'UPDATE', 'RECALCULATE']);

      // Range recalculation is idempotent.
      const range = await api(ana)
        .post(`${tx}/recalculate-split`, { from: '2026-01-01', to: '2026-12-31' })
        .expect(200);
      expect(range.body).toEqual({ recalculated: 0, unchanged: 1 });
    });

    it('previews a split without saving anything', async () => {
      const { ana, anaId, brunoId, tx, householdId } = await couple();
      const preview = await api(ana)
        .post(`${tx}/preview-split`, { amountCents: 333, date: '2026-03-10' })
        .expect(200);
      expect(preview.body).toEqual({
        split: {
          type: 'EQUAL',
          weights: [
            { memberId: anaId, weight: 1 },
            { memberId: brunoId, weight: 1 },
          ],
        },
        allocations: [
          { memberId: anaId, amountCents: 167 },
          { memberId: brunoId, amountCents: 166 },
        ],
      });
      const [row] = await db.query<{ count: number }[]>(
        `SELECT count(*)::int AS count FROM transactions WHERE household_id = $1`,
        [householdId],
      );
      expect(row?.count).toBe(0);
    });

    it('edits with optimistic concurrency and a new split', async () => {
      const { ana, bruno, supermercadoId, anaId, brunoId, tx } = await couple();
      const created = (await api(ana).post(tx, expense(supermercadoId, anaId)).expect(201))
        .body as Transaction;
      await api(bruno)
        .patch(`${tx}/${created.id}`, {
          version: 1,
          split: { type: 'INDIVIDUAL', responsibleMemberId: anaId },
          date: '2026-03-11',
        })
        .expect(200);
      const stale = await api(ana)
        .patch(`${tx}/${created.id}`, { version: 1, description: 'Outra' })
        .expect(409);
      expect(stale.body).toMatchObject({
        error: {
          code: 'VERSION_CONFLICT',
          details: { current: { version: 2, date: '2026-03-11' } },
        },
      });
      expect(brunoId).not.toBe(anaId);
    });

    it('soft-deletes and restores, keeping a full history', async () => {
      const { ana, bruno, supermercadoId, anaId, tx } = await couple();
      const created = (await api(ana).post(tx, expense(supermercadoId, anaId)).expect(201))
        .body as Transaction;
      await api(bruno).delete(`${tx}/${created.id}`).expect(204);
      await api(bruno).delete(`${tx}/${created.id}`).expect(204); // idempotent

      expect(((await api(ana).get(tx).expect(200)).body as { data: unknown[] }).data).toHaveLength(
        0,
      );
      const deleted = (await api(ana).get(`${tx}?deleted=only`).expect(200)).body as {
        data: Transaction[];
      };
      expect(deleted.data.map((t) => t.id)).toEqual([created.id]);
      await api(ana).patch(`${tx}/${created.id}`, { version: 2, description: 'X' }).expect(404);

      const restored = await api(ana).post(`${tx}/${created.id}/restore`).expect(200);
      expect(restored.body).toMatchObject({ deletedAt: null, version: 3 });

      const history = (await api(ana).get(`${tx}/${created.id}/history`).expect(200)).body as {
        action: string;
        actorDisplayName: string;
      }[];
      expect(history.map((entry) => entry.action)).toEqual(['CREATE', 'DELETE', 'RESTORE']);
      expect(history.every((entry) => entry.actorDisplayName === 'Alex')).toBe(true);
    });
  });

  describe('listing', () => {
    it('filters and paginates newest first with a stable cursor', async () => {
      const { ana, supermercadoId, moradiaId, mercadoId, anaId, brunoId, tx, categories } =
        await couple();
      const condominio = categories
        .find((c) => c.name === 'Moradia')
        ?.children.find((c) => c.name === 'Condomínio');
      const dates = ['2026-03-01', '2026-03-05', '2026-03-05', '2026-03-09', '2026-04-01'];
      for (const [i, date] of dates.entries()) {
        await api(ana)
          .post(
            tx,
            expense(
              i % 2 === 0 ? supermercadoId : (condominio?.id ?? moradiaId),
              i < 3 ? anaId : brunoId,
              {
                date,
                description: `Despesa ${i}`,
                tags: i === 4 ? ['viagem'] : [],
                ...(i === 1 ? { split: { type: 'INDIVIDUAL', responsibleMemberId: brunoId } } : {}),
              },
            ),
          )
          .expect(201);
      }

      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const page = (
          await api(ana)
            .get(`${tx}?limit=2${cursor ? `&cursor=${cursor}` : ''}`)
            .expect(200)
        ).body as {
          data: { description: string; date: string }[];
          page: { nextCursor: string | null };
        };
        seen.push(...page.data.map((t) => `${t.date} ${t.description}`));
        cursor = page.page.nextCursor;
      } while (cursor);
      expect(seen).toHaveLength(5);
      expect(seen[0]).toBe('2026-04-01 Despesa 4');
      expect(
        [...seen]
          .sort()
          .reverse()
          .map((s) => s.slice(0, 10)),
      ).toEqual(seen.map((s) => s.slice(0, 10)));

      const count = async (query: string) =>
        ((await api(ana).get(`${tx}?${query}`).expect(200)).body as { data: unknown[] }).data
          .length;
      expect(await count(`categoryId=${mercadoId}`)).toBe(3); // parent includes its subcategories
      expect(await count(`payerMemberId=${brunoId}`)).toBe(2);
      expect(await count(`responsibleMemberId=${anaId}`)).toBe(4); // INDIVIDUAL for Bruno excluded
      expect(await count('from=2026-03-05&to=2026-03-31')).toBe(3);
      expect(await count('q=viag')).toBe(1);
      expect(await count('q=%25')).toBe(0); // LIKE wildcards are escaped
      await api(ana).get(`${tx}?cursor=bogus`).expect(400);
    });
  });

  describe('isolation and membership', () => {
    it('hides expenses from other households and rejects their members and categories', async () => {
      const first = await couple();
      const second = await couple();
      const created = (
        await api(first.ana).post(first.tx, expense(first.supermercadoId, first.anaId)).expect(201)
      ).body as Transaction;

      await api(second.ana).get(`${first.tx}/${created.id}`).expect(404);
      await api(second.ana).get(`${second.tx}/${created.id}`).expect(404);
      await api(second.ana)
        .post(second.tx, expense(second.supermercadoId, first.anaId))
        .expect(400);
      await api(second.ana)
        .post(second.tx, expense(first.supermercadoId, second.anaId))
        .expect(400);
      await api(second.ana)
        .post(
          second.tx,
          expense(second.supermercadoId, second.anaId, {
            split: { type: 'INDIVIDUAL', responsibleMemberId: first.anaId },
          }),
        )
        .expect(400);
    });

    it('keeps history editable after a member leaves, but not for new expenses', async () => {
      const { ana, supermercadoId, anaId, brunoId, tx, householdId } = await couple();
      const old = (await api(ana).post(tx, expense(supermercadoId, brunoId)).expect(201))
        .body as Transaction;
      await api(ana).delete(`/households/${householdId}/members/${brunoId}`).expect(204);

      await api(ana).post(tx, expense(supermercadoId, brunoId)).expect(400);
      // New expenses default to the remaining active member only.
      const solo = (await api(ana).post(tx, expense(supermercadoId, anaId)).expect(201))
        .body as Transaction;
      expect(solo.allocations).toEqual([{ memberId: anaId, amountCents: 10001 }]);
      // The old expense still names the former member and can be edited.
      const edited = await api(ana)
        .patch(`${tx}/${old.id}`, { version: 1, amountCents: 300 })
        .expect(200);
      expect((edited.body as Transaction).allocations).toEqual([
        { memberId: anaId, amountCents: 150 },
        { memberId: brunoId, amountCents: 150 },
      ]);
    });
  });

  it('the database rejects allocations that do not add up (defense in depth)', async () => {
    const { ana, supermercadoId, anaId, tx } = await couple();
    const created = (await api(ana).post(tx, expense(supermercadoId, anaId)).expect(201))
      .body as Transaction;
    await expect(
      db.transaction(async (manager) => {
        await manager.query(
          `UPDATE transaction_allocations SET amount_cents = amount_cents + 1
           WHERE transaction_id = $1 AND member_id = $2`,
          [created.id, anaId],
        );
      }),
    ).rejects.toThrow(/do not add up/);
  });
});
