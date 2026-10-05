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
interface DashboardMember {
  memberId: string;
  status: string;
  paidCents: number;
  paidSharedCents: number;
  responsibleSharedCents: number;
  paidShareBps: number | null;
  responsibleShareBps: number | null;
  deviationBps: number | null;
  sharedDifferenceCents: number;
  periodBalanceCents: number;
  cumulativeBalanceCents: number;
}
interface Dashboard {
  month: string;
  from: string;
  to: string;
  currency: string;
  hasAnyTransactions: boolean;
  totals: {
    sharedSpendCents: number;
    individualSpendCents: number;
    totalSpendCents: number;
    transactionCount: number;
  };
  members: DashboardMember[];
  categories: { categoryId: string; name: string; sharedSpendCents: number; shareBps: number }[];
  explanations: {
    memberId: string;
    direction: 'ABOVE' | 'BELOW';
    categories: { categoryId: string; name: string; deltaCents: number }[];
    transactions: { transactionId: string; deltaCents: number }[];
  }[];
  settlementSuggestion: { fromMemberId: string; toMemberId: string; amountCents: number } | null;
}
interface Settlement {
  id: string;
  fromMemberId: string;
  toMemberId: string;
  amountCents: number;
  date: string;
  notes: string | null;
  deletedAt: string | null;
}

describe('Dashboard and settlements (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  const clock = new FakeClock();

  beforeAll(async () => {
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
    delete: (path: string) =>
      request(server).delete(`/api/v1${path}`).set('Authorization', `Bearer ${user.token}`),
  });

  const couple = async () => {
    const ana = await newUser('dash-ana');
    const bruno = await newUser('dash-bruno');
    const created = await api(ana).post('/households', { name: 'Casa' }).expect(201);
    const body = created.body as { id: string; me: { memberId: string } };
    const householdId = body.id;
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
    const categories = (await api(ana).get(`/households/${householdId}/categories`).expect(200))
      .body as Category[];
    const top = (name: string) => categories.find((c) => c.name === name);
    return {
      ana,
      bruno,
      householdId,
      anaId: body.me.memberId,
      brunoId: members.find((m) => !m.isMe)?.id ?? '',
      moradiaId: top('Moradia')?.id ?? '',
      condominioId: top('Moradia')?.children.find((c) => c.name === 'Condomínio')?.id ?? '',
      mercadoId: top('Mercado')?.id ?? '',
      lazerId: top('Lazer')?.id ?? '',
      tx: `/households/${householdId}/transactions`,
      settlements: `/households/${householdId}/settlements`,
      dashboard: (month?: string) =>
        `/households/${householdId}/dashboard${month ? `?month=${month}` : ''}`,
    };
  };

  const expense = (
    categoryId: string,
    payerMemberId: string,
    amountCents: number,
    extra: object = {},
  ) => ({
    description: 'Despesa',
    amountCents,
    date: '2026-03-10',
    categoryId,
    payerMemberId,
    paymentMethod: 'PIX',
    split: { type: 'EQUAL' },
    ...extra,
  });

  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

  describe('settlements', () => {
    it('records, lists, deletes and restores a settlement, with audit', async () => {
      const { ana, bruno, anaId, brunoId, settlements, householdId } = await couple();
      const created = (
        await api(bruno)
          .post(settlements, {
            fromMemberId: brunoId,
            toMemberId: anaId,
            amountCents: 35000,
            date: '2026-03-31',
            notes: '  Pix do mês  ',
          })
          .expect(201)
      ).body as Settlement;
      expect(created).toMatchObject({
        fromMemberId: brunoId,
        toMemberId: anaId,
        amountCents: 35000,
        notes: 'Pix do mês',
        deletedAt: null,
      });

      const listed = (
        await api(ana).get(`${settlements}?from=2026-03-01&to=2026-03-31`).expect(200)
      ).body as Settlement[];
      expect(listed.map((s) => s.id)).toEqual([created.id]);
      const april = (await api(ana).get(`${settlements}?from=2026-04-01&to=2026-04-30`).expect(200))
        .body as Settlement[];
      expect(april).toEqual([]);

      await api(ana).delete(`${settlements}/${created.id}`).expect(204);
      await api(ana).delete(`${settlements}/${created.id}`).expect(204); // idempotent
      expect((await api(ana).get(settlements).expect(200)).body).toEqual([]);
      const deleted = (await api(ana).get(`${settlements}?deleted=only`).expect(200))
        .body as Settlement[];
      expect(deleted[0]?.deletedAt).not.toBeNull();

      const restored = (await api(ana).post(`${settlements}/${created.id}/restore`).expect(200))
        .body as Settlement;
      expect(restored.deletedAt).toBeNull();

      const events: { action: string }[] = await app.get(DataSource).query(
        `SELECT action FROM audit_events WHERE household_id = $1 AND entity_type = 'SETTLEMENT'
           ORDER BY occurred_at, id`,
        [householdId],
      );
      expect(events.map((e) => e.action)).toEqual(['CREATE', 'DELETE', 'RESTORE']);
    });

    it('rejects a settlement to oneself, to a non-member or with invalid amounts', async () => {
      const { ana, anaId, settlements } = await couple();
      const base = { fromMemberId: anaId, amountCents: 100, date: '2026-03-01' };
      const self = await api(ana)
        .post(settlements, { ...base, toMemberId: anaId })
        .expect(400);
      expect(self.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });

      const stranger = await couple();
      await api(ana)
        .post(settlements, { ...base, toMemberId: stranger.anaId })
        .expect(400);
      await api(ana)
        .post(settlements, { ...base, toMemberId: stranger.anaId, amountCents: 0 })
        .expect(400);
    });

    it('is invisible to other households (404)', async () => {
      const first = await couple();
      const created = (
        await api(first.ana)
          .post(first.settlements, {
            fromMemberId: first.anaId,
            toMemberId: first.brunoId,
            amountCents: 100,
            date: '2026-03-01',
          })
          .expect(201)
      ).body as Settlement;
      const other = await couple();
      await api(other.ana).get(first.settlements).expect(404);
      await api(other.ana).delete(`${other.settlements}/${created.id}`).expect(404);
    });
  });

  describe('dashboard', () => {
    it('returns an empty month that guides to the first expense', async () => {
      const { ana, dashboard, anaId, brunoId } = await couple();
      const body = (await api(ana).get(dashboard('2026-03')).expect(200)).body as Dashboard;
      expect(body).toMatchObject({
        month: '2026-03',
        from: '2026-03-01',
        to: '2026-03-31',
        currency: 'BRL',
        hasAnyTransactions: false,
        totals: { sharedSpendCents: 0, individualSpendCents: 0, totalSpendCents: 0 },
        categories: [],
        explanations: [],
        settlementSuggestion: null,
      });
      expect(body.members.map((m) => [m.memberId, m.paidShareBps])).toEqual([
        [anaId, null],
        [brunoId, null],
      ]);
    });

    it('computes shares, deviation, explanation and balances for a month', async () => {
      const c = await couple();
      const { ana, bruno, anaId, brunoId } = c;
      // Shared (EQUAL): Ana R$ 1.200 condomínio + R$ 580 mercado; Bruno R$ 200 lazer.
      await api(ana)
        .post(c.tx, expense(c.condominioId, anaId, 120000))
        .expect(201);
      await api(ana)
        .post(c.tx, expense(c.mercadoId, anaId, 58000))
        .expect(201);
      await api(bruno)
        .post(c.tx, expense(c.lazerId, brunoId, 20000))
        .expect(201);
      // Individual: Bruno's own R$ 300 paid by Bruno, and R$ 100 of Bruno's paid by Ana.
      const individual = { split: { type: 'INDIVIDUAL', responsibleMemberId: brunoId } };
      await api(bruno)
        .post(c.tx, expense(c.lazerId, brunoId, 30000, individual))
        .expect(201);
      await api(ana)
        .post(c.tx, expense(c.lazerId, anaId, 10000, individual))
        .expect(201);
      // Deleted expenses and other months never count.
      const gone = (
        await api(ana)
          .post(c.tx, expense(c.lazerId, anaId, 99900))
          .expect(201)
      ).body as { id: string };
      await api(ana).delete(`${c.tx}/${gone.id}`).expect(204);
      await api(ana)
        .post(c.tx, expense(c.lazerId, anaId, 5000, { date: '2026-04-01' }))
        .expect(201);
      await api(ana)
        .post(c.tx, expense(c.lazerId, brunoId, 7000, { date: '2026-02-28' }))
        .expect(201);

      const body = (await api(bruno).get(c.dashboard('2026-03')).expect(200)).body as Dashboard;
      expect(body.hasAnyTransactions).toBe(true);
      expect(body.totals).toEqual({
        sharedSpendCents: 198000,
        individualSpendCents: 40000,
        totalSpendCents: 238000,
        transactionCount: 5,
      });
      const [anaRow, brunoRow] = body.members;
      // Ana paid 178.000 of 198.000 shared = 89,90% vs 50% planned.
      expect(anaRow).toMatchObject({
        memberId: anaId,
        paidCents: 188000,
        paidSharedCents: 178000,
        responsibleSharedCents: 99000,
        paidShareBps: 8990,
        responsibleShareBps: 5000,
        deviationBps: 3990,
        sharedDifferenceCents: 79000,
        // paid 188.000 − responsible 99.000 = 89.000
        periodBalanceCents: 89000,
      });
      expect(brunoRow).toMatchObject({
        memberId: brunoId,
        paidShareBps: 1010,
        deviationBps: -3990,
        periodBalanceCents: -89000,
      });
      expect(sum(body.members.map((m) => m.periodBalanceCents))).toBe(0);

      // Explanation: Moradia (+60.000) then Mercado (+29.000) for Ana; Lazer pushes the other way.
      const explanation = body.explanations.find((e) => e.memberId === anaId);
      expect(explanation?.direction).toBe('ABOVE');
      expect(explanation?.categories.map((x) => [x.name, x.deltaCents])).toEqual([
        ['Moradia', 60000],
        ['Mercado', 29000],
      ]);
      expect(explanation?.transactions.map((x) => x.deltaCents)).toEqual([60000, 29000]);

      // Categories: top-level, shared scope only, largest first.
      expect(body.categories.map((x) => [x.categoryId, x.sharedSpendCents])).toEqual([
        [c.moradiaId, 120000],
        [c.mercadoId, 58000],
        [c.lazerId, 20000],
      ]);
      expect(sum(body.categories.map((x) => x.shareBps))).toBe(10000);

      // Cumulative also counts February: Bruno paid R$ 70 split equally → Bruno +35, Ana −35.
      expect(anaRow?.cumulativeBalanceCents).toBe(89000 - 3500);
      expect(brunoRow?.cumulativeBalanceCents).toBe(-89000 + 3500);
      expect(body.settlementSuggestion).toEqual({
        fromMemberId: brunoId,
        toMemberId: anaId,
        amountCents: 85500,
      });

      // Income values never reach the dashboard (ADR-005).
      expect(JSON.stringify(body)).not.toMatch(/income/i);
    });

    it('settlements move balances only and the suggestion closes them', async () => {
      const c = await couple();
      await api(c.ana)
        .post(c.tx, expense(c.mercadoId, c.anaId, 10000))
        .expect(201);
      let body = (await api(c.ana).get(c.dashboard('2026-03')).expect(200)).body as Dashboard;
      const suggestion = body.settlementSuggestion;
      expect(suggestion).toEqual({
        fromMemberId: c.brunoId,
        toMemberId: c.anaId,
        amountCents: 5000,
      });

      await api(c.bruno)
        .post(c.settlements, { ...suggestion, date: '2026-03-20' })
        .expect(201);
      body = (await api(c.ana).get(c.dashboard('2026-03')).expect(200)).body as Dashboard;
      expect(body.totals.totalSpendCents).toBe(10000); // not spend
      expect(body.members.map((m) => m.periodBalanceCents)).toEqual([0, 0]);
      expect(body.members.map((m) => m.cumulativeBalanceCents)).toEqual([0, 0]);
      expect(body.members[0]?.paidShareBps).toBe(10000); // shares ignore settlements
      expect(body.settlementSuggestion).toBeNull();

      // A settlement dated in April does not change March, but it does change April's cumulative.
      await api(c.bruno)
        .post(c.settlements, {
          fromMemberId: c.brunoId,
          toMemberId: c.anaId,
          amountCents: 1000,
          date: '2026-04-02',
        })
        .expect(201);
      body = (await api(c.ana).get(c.dashboard('2026-03')).expect(200)).body as Dashboard;
      expect(body.members.map((m) => m.cumulativeBalanceCents)).toEqual([0, 0]);
      body = (await api(c.ana).get(c.dashboard('2026-04')).expect(200)).body as Dashboard;
      expect(body.members.map((m) => m.periodBalanceCents)).toEqual([-1000, 1000]);
      expect(body.members.map((m) => m.cumulativeBalanceCents)).toEqual([-1000, 1000]);
      expect(body.settlementSuggestion).toEqual({
        fromMemberId: c.anaId,
        toMemberId: c.brunoId,
        amountCents: 1000,
      });
    });

    it('defaults to the current month in the household time zone', async () => {
      // 02:00 UTC on 1 Nov is still 31 Oct in São Paulo. Tokens are issued on the same clock.
      clock.set(new Date('2026-11-01T02:00:00Z'));
      try {
        const c = await couple();
        const body = (await api(c.ana).get(c.dashboard()).expect(200)).body as Dashboard;
        expect(body.month).toBe('2026-10');
      } finally {
        clock.set(new Date());
      }
    });

    it('validates the month and keeps other households out', async () => {
      const c = await couple();
      await api(c.ana).get(c.dashboard('2026-13')).expect(400);
      await api(c.ana).get(c.dashboard('2026-3')).expect(400);
      const other = await couple();
      await api(other.ana).get(c.dashboard('2026-03')).expect(404);
    });

    it('keeps a former member with figures and the balance consistent', async () => {
      const c = await couple();
      await api(c.bruno)
        .post(c.tx, expense(c.mercadoId, c.brunoId, 10000))
        .expect(201);
      await api(c.bruno).post(`/households/${c.householdId}/leave`).expect(204);
      const body = (await api(c.ana).get(c.dashboard('2026-03')).expect(200)).body as Dashboard;
      expect(body.members.map((m) => [m.memberId, m.status])).toEqual([
        [c.anaId, 'ACTIVE'],
        [c.brunoId, 'LEFT'],
      ]);
      expect(sum(body.members.map((m) => m.cumulativeBalanceCents))).toBe(0);
      // Settling with a former member is allowed.
      await api(c.ana)
        .post(c.settlements, {
          fromMemberId: c.anaId,
          toMemberId: c.brunoId,
          amountCents: 5000,
          date: '2026-03-31',
        })
        .expect(201);
      const after = (await api(c.ana).get(c.dashboard('2026-03')).expect(200)).body as Dashboard;
      expect(after.members.map((m) => m.cumulativeBalanceCents)).toEqual([0, 0]);
    });
  });
});
