import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { type App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { register, uniqueEmail } from './auth-helpers';
import { createTestApp, FakeClock } from './create-test-app';

interface TestUser {
  email: string;
  token: string;
}
interface Category {
  id: string;
  name: string;
  children: Category[];
}
interface BudgetStatus {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryArchived: boolean;
  amountCents: number;
  spentCents: number;
  remainingCents: number;
  usedBps: number;
  state: string;
  fromMonth: string;
  toMonth: string | null;
  next: { fromMonth: string; amountCents: number | null } | null;
}
interface BudgetMonth {
  month: string;
  editable: boolean;
  data: BudgetStatus[];
}

// "Today" is 15 Oct 2026 in São Paulo.
const NOW = new Date('2026-10-15T15:00:00Z');

describe('Budgets (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  const clock = new FakeClock();

  beforeAll(async () => {
    clock.set(NOW);
    app = await createTestApp({ clock });
    server = app.getHttpServer();
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

  const household = async () => {
    const ana = await newUser('bud-ana');
    const created = await api(ana).post('/households', { name: 'Casa' }).expect(201);
    const body = created.body as { id: string; me: { memberId: string } };
    const h = body.id;
    const categories = (await api(ana).get(`/households/${h}/categories`).expect(200))
      .body as Category[];
    const top = (name: string) => categories.find((c) => c.name === name);
    return {
      ana,
      h,
      anaId: body.me.memberId,
      moradiaId: top('Moradia')?.id ?? '',
      condominioId: top('Moradia')?.children.find((c) => c.name === 'Condomínio')?.id ?? '',
      mercadoId: top('Mercado')?.id ?? '',
      lazerId: top('Lazer')?.id ?? '',
      budgets: `/households/${h}/budgets`,
      tx: `/households/${h}/transactions`,
    };
  };

  type Household = Awaited<ReturnType<typeof household>>;

  const setBudget = (
    c: Household,
    categoryId: string | null,
    amountCents: number | null,
    fromMonth: string,
  ) => api(c.ana).post(`${c.budgets}/changes`, { categoryId, amountCents, fromMonth });

  const month = async (c: Household, m?: string) =>
    (
      await api(c.ana)
        .get(`${c.budgets}${m ? `?month=${m}` : ''}`)
        .expect(200)
    ).body as BudgetMonth;

  const expense = (c: Household, categoryId: string, amountCents: number, extra: object = {}) =>
    api(c.ana)
      .post(c.tx, {
        description: 'Despesa',
        amountCents,
        date: '2026-10-10',
        categoryId,
        payerMemberId: c.anaId,
        paymentMethod: 'PIX',
        ...extra,
      })
      .expect(201);

  it('measures shared spend with subcategories and alert states (FR-BUD-01/02/04)', async () => {
    const c = await household();
    await setBudget(c, null, 300000, '2026-10').expect(200);
    await setBudget(c, c.moradiaId, 150000, '2026-10').expect(200);
    await setBudget(c, c.mercadoId, 50000, '2026-10').expect(200);
    await setBudget(c, c.lazerId, 40000, '2026-10').expect(200);

    await expense(c, c.condominioId, 120000); // subcategory of Moradia
    await expense(c, c.mercadoId, 58000);
    // Not counted: individual, deleted, other month.
    await expense(c, c.lazerId, 50000, {
      split: { type: 'INDIVIDUAL', responsibleMemberId: c.anaId },
    });
    const deleted = (await expense(c, c.lazerId, 30000)).body as { id: string };
    await api(c.ana).delete(`${c.tx}/${deleted.id}`).expect(204);
    await expense(c, c.mercadoId, 99000, { date: '2026-11-01' });

    const view = await month(c);
    expect(view).toMatchObject({ month: '2026-10', editable: true });
    expect(
      view.data.map((b) => [b.categoryName, b.spentCents, b.remainingCents, b.usedBps, b.state]),
    ).toEqual([
      [null, 178000, 122000, 5933, 'OK'],
      ['Lazer', 0, 40000, 0, 'OK'],
      ['Mercado', 58000, -8000, 11600, 'EXCEEDED'],
      ['Moradia', 120000, 30000, 8000, 'WARNING'],
    ]);
  });

  it('applies changes from a month on, never to past months (FR-BUD-03)', async () => {
    const c = await household();
    await setBudget(c, null, 300000, '2026-10').expect(200);
    const changed = (await setBudget(c, null, 350000, '2026-12').expect(200)).body as BudgetMonth;
    expect(changed.month).toBe('2026-12');
    expect(changed.data[0]?.amountCents).toBe(350000);

    const october = await month(c, '2026-10');
    expect(october.data[0]).toMatchObject({
      amountCents: 300000,
      fromMonth: '2026-10',
      toMonth: '2026-11',
      next: { fromMonth: '2026-12', amountCents: 350000 },
    });
    expect((await month(c, '2026-11')).data[0]?.amountCents).toBe(300000);
    // No rollover: the unspent October amount does not reach November or December.
    expect((await month(c, '2026-12')).data[0]?.remainingCents).toBe(350000);

    // A new change from November supersedes the scheduled December one.
    await setBudget(c, null, 320000, '2026-11').expect(200);
    expect((await month(c, '2026-12')).data[0]?.amountCents).toBe(320000);

    // Past months are read-only and unaffected.
    const past = await setBudget(c, null, 1, '2026-09').expect(400);
    expect(past.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    const september = await month(c, '2026-09');
    expect(september).toMatchObject({ editable: false, data: [] });

    // From October on it is 3.000 again: the November change is superseded.
    await setBudget(c, null, 300000, '2026-10').expect(200);
    expect((await month(c, '2026-12')).data[0]?.amountCents).toBe(300000);
    // Repeating it changes nothing (no new period, no audit event).
    await setBudget(c, null, 300000, '2026-11').expect(200);
    const rows: { periods: string; events: string }[] = await app.get(DataSource).query(
      `SELECT (SELECT count(*) FROM budgets WHERE household_id = $1 AND deleted_at IS NULL) AS periods,
              (SELECT count(*) FROM audit_events WHERE household_id = $1 AND entity_type = 'BUDGET') AS events`,
      [c.h],
    );
    expect(rows[0]).toEqual({ periods: '1', events: '4' });
  });

  it('removes a budget from a month on', async () => {
    const c = await household();
    await setBudget(c, c.moradiaId, 150000, '2026-10').expect(200);
    await setBudget(c, c.moradiaId, null, '2026-11').expect(200);
    expect((await month(c, '2026-11')).data).toEqual([]);
    expect((await month(c, '2026-10')).data[0]).toMatchObject({
      toMonth: '2026-10',
      next: { fromMonth: '2026-11', amountCents: null },
    });
    // Removing what does not exist is a no-op.
    await setBudget(c, c.lazerId, null, '2026-11').expect(200);
  });

  it('keeps budgets of archived categories but rejects new ones', async () => {
    const c = await household();
    await setBudget(c, c.lazerId, 40000, '2026-10').expect(200);
    await api(c.ana)
      .patch(`/households/${c.h}/categories/${c.lazerId}`, { archived: true })
      .expect(204);
    expect((await month(c)).data[0]).toMatchObject({
      categoryName: 'Lazer',
      categoryArchived: true,
    });
    const rejected = await setBudget(c, c.lazerId, 50000, '2026-11').expect(422);
    expect(rejected.body).toMatchObject({ error: { code: 'CATEGORY_ARCHIVED' } });
    // Ending it is still possible.
    await setBudget(c, c.lazerId, null, '2026-11').expect(200);
  });

  it('validates input, audits and isolates households', async () => {
    const c = await household();
    await setBudget(c, null, 0, '2026-10').expect(400);
    await setBudget(c, null, 100, '2026-13').expect(400);
    await setBudget(c, '0199a0b0-0000-7000-8000-000000000000', 100, '2026-10').expect(400);
    await api(c.ana).get(`${c.budgets}?month=2026-1`).expect(400);

    await setBudget(c, null, 300000, '2026-10').expect(200);
    const audit: { action: string }[] = await app
      .get(DataSource)
      .query(`SELECT action FROM audit_events WHERE household_id = $1 AND entity_type = 'BUDGET'`, [
        c.h,
      ]);
    expect(audit.map((a) => a.action)).toEqual(['CREATE']);

    const other = await household();
    await api(other.ana).get(c.budgets).expect(404);
    await api(other.ana)
      .post(`${c.budgets}/changes`, { categoryId: null, amountCents: 1, fromMonth: '2026-10' })
      .expect(404);
    // Another household's category is unknown here.
    await setBudget(other, c.moradiaId, 100, '2026-10').expect(400);
  });
});
