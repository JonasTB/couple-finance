import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { type App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { CSRF, register, STRONG_PASSWORD, uniqueEmail } from './auth-helpers';
import { createTestApp, FakeClock } from './create-test-app';

interface TestUser {
  email: string;
  token: string;
}
interface Goal {
  id: string;
  status: string;
  savedCents: number;
  remainingCents: number;
  progressBps: number;
  version: number;
  byMember: { memberId: string; savedCents: number }[];
  forecast: {
    paceCents: number | null;
    paceMonths: number;
    monthsToGo: number | null;
    forecastMonth: string | null;
    requiredMonthlyCents: number | null;
    deadlinePassed: boolean;
  };
  entries?: { id: string; type: string; amountCents: number; deletedAt: string | null }[];
}
interface Plan {
  id: string;
  status: string;
  version: number;
  totals: Record<string, number>;
  goal: { id: string; name: string; savedCents: number; coverageBps: number | null } | null;
  items?: {
    id: string;
    name: string;
    status: string;
    version: number;
    paidPriceCents: number | null;
    purchasedAt: string | null;
    estimatedTotalCents: number;
    transaction: { id: string; amountCents: number } | null;
  }[];
}

const JULY = new Date('2026-07-01T15:00:00Z');
const NOW = new Date('2026-10-15T15:00:00Z');

describe('Goals and purchase plans (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  const clock = new FakeClock();

  beforeAll(async () => {
    clock.set(NOW);
    app = await createTestApp({ clock });
    server = app.getHttpServer();
  });

  afterEach(() => {
    clock.set(NOW);
  });

  afterAll(async () => {
    await app.close();
  });

  const newUser = async (prefix: string): Promise<TestUser> => {
    const email = uniqueEmail(prefix);
    const { accessToken } = await register(server, { email });
    return { email, token: accessToken };
  };

  const relogin = async (user: TestUser): Promise<void> => {
    const response = await request(server)
      .post('/api/v1/auth/login')
      .set(CSRF)
      .send({ email: user.email, password: STRONG_PASSWORD })
      .expect(200);
    user.token = (response.body as { accessToken: string }).accessToken;
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

  const couple = async () => {
    const ana = await newUser('plan-ana');
    const bruno = await newUser('plan-bruno');
    const created = await api(ana).post('/households', { name: 'Casa' }).expect(201);
    const body = created.body as { id: string; me: { memberId: string } };
    const h = body.id;
    const invite = await api(ana)
      .post(`/households/${h}/invitations`, { email: bruno.email })
      .expect(201);
    await api(bruno)
      .post('/invitations/accept', { token: (invite.body as { token: string }).token })
      .expect(200);
    const members = (await api(ana).get(`/households/${h}/members`).expect(200)).body as {
      id: string;
      isMe: boolean;
    }[];
    const categories = (await api(ana).get(`/households/${h}/categories`).expect(200)).body as {
      id: string;
      name: string;
    }[];
    return {
      ana,
      bruno,
      h,
      anaId: body.me.memberId,
      brunoId: members.find((m) => !m.isMe)?.id ?? '',
      categoryId: categories.find((c) => c.name === 'Casa e decoração')?.id ?? '',
      goals: `/households/${h}/goals`,
      plans: `/households/${h}/purchase-plans`,
    };
  };

  const entry = (memberId: string, amountCents: number, date: string, type = 'CONTRIBUTION') => ({
    memberId,
    type,
    amountCents,
    date,
  });

  describe('goals', () => {
    it('tracks progress per member and forecasts at the current pace (FR-GOAL-01..03)', async () => {
      clock.set(JULY);
      const c = await couple();
      const goal = (
        await api(c.ana)
          .post(c.goals, {
            name: 'Reserva',
            targetAmountCents: 1_200_000,
            targetDate: '2027-03-31',
            participantMemberIds: [c.anaId, c.brunoId],
          })
          .expect(201)
      ).body as Goal;
      clock.set(NOW);
      await relogin(c.ana);
      const path = `${c.goals}/${goal.id}/entries`;
      await api(c.ana)
        .post(path, entry(c.anaId, 60_000, '2026-07-10'))
        .expect(201);
      await api(c.ana)
        .post(path, entry(c.brunoId, 40_000, '2026-07-12'))
        .expect(201);
      await api(c.ana)
        .post(path, entry(c.anaId, 120_000, '2026-08-10'))
        .expect(201);
      await api(c.ana)
        .post(path, entry(c.anaId, 20_000, '2026-08-20', 'WITHDRAWAL'))
        .expect(201);
      await api(c.ana)
        .post(path, entry(c.brunoId, 100_000, '2026-09-10'))
        .expect(201);
      const view = (
        await api(c.ana)
          .post(path, entry(c.anaId, 50_000, '2026-10-01'))
          .expect(201)
      ).body as Goal;

      expect(view).toMatchObject({
        status: 'ACTIVE',
        savedCents: 350_000,
        remainingCents: 850_000,
        progressBps: 2916,
        byMember: [
          { memberId: c.anaId, savedCents: 210_000 },
          { memberId: c.brunoId, savedCents: 140_000 },
        ],
      });
      // Pace: (100.000 + 100.000 + 100.000) / 3 complete months (Jul–Sep).
      expect(view.forecast).toEqual({
        paceCents: 100_000,
        paceMonths: 3,
        monthsToGo: 9,
        forecastMonth: '2027-07',
        // 850.000 over Oct..Mar (6 months), rounded up.
        requiredMonthlyCents: 141_667,
        deadlinePassed: false,
      });
      expect(view.entries?.map((e) => e.amountCents)).toEqual([
        50_000, 100_000, 20_000, 120_000, 40_000, 60_000,
      ]);
    });

    it('never holds a negative amount and rejects future or foreign entries', async () => {
      const c = await couple();
      const goal = (
        await api(c.ana)
          .post(c.goals, {
            name: 'Viagem',
            targetAmountCents: 500_000,
            participantMemberIds: [c.anaId],
          })
          .expect(201)
      ).body as Goal;
      const path = `${c.goals}/${goal.id}/entries`;
      const deposit = (
        await api(c.ana)
          .post(path, entry(c.anaId, 30_000, '2026-10-01'))
          .expect(201)
      ).body as Goal;
      const tooMuch = await api(c.ana)
        .post(path, entry(c.anaId, 30_001, '2026-10-02', 'WITHDRAWAL'))
        .expect(422);
      expect(tooMuch.body).toMatchObject({ error: { code: 'GOAL_INSUFFICIENT_BALANCE' } });
      await api(c.ana)
        .post(path, entry(c.anaId, 1, '2026-10-16'))
        .expect(400);
      await api(c.ana)
        .post(path, entry(c.brunoId, 1, '2026-10-01'))
        .expect(400);

      const withdrawn = (
        await api(c.ana)
          .post(path, entry(c.anaId, 10_000, '2026-10-02', 'WITHDRAWAL'))
          .expect(201)
      ).body as Goal;
      const contributionId = deposit.entries?.[0]?.id ?? '';
      // Deleting the contribution would leave −10.000.
      const blocked = await api(c.ana).delete(`${path}/${contributionId}`).expect(422);
      expect(blocked.body).toMatchObject({ error: { code: 'GOAL_INSUFFICIENT_BALANCE' } });
      const withdrawalId = withdrawn.entries?.[0]?.id ?? '';
      const removed = (await api(c.ana).delete(`${path}/${withdrawalId}`).expect(200)).body as Goal;
      expect(removed.savedCents).toBe(30_000);
      expect(removed.entries?.find((e) => e.id === withdrawalId)?.deletedAt).not.toBeNull();
      await api(c.ana).post(`${path}/${withdrawalId}/restore`).expect(200);
    });

    it('archives, achieves, validates and isolates goals', async () => {
      const c = await couple();
      await api(c.ana)
        .post(c.goals, { name: 'X', targetAmountCents: 100, participantMemberIds: [] })
        .expect(400);
      await api(c.ana)
        .post(c.goals, {
          name: 'X',
          targetAmountCents: 100,
          participantMemberIds: ['0199a0b0-0000-7000-8000-000000000000'],
        })
        .expect(400);
      const goal = (
        await api(c.ana)
          .post(c.goals, {
            name: 'Bicicleta',
            targetAmountCents: 100_000,
            participantMemberIds: [c.brunoId],
          })
          .expect(201)
      ).body as Goal;
      const achieved = (
        await api(c.bruno)
          .post(`${c.goals}/${goal.id}/entries`, entry(c.brunoId, 100_000, '2026-10-10'))
          .expect(201)
      ).body as Goal;
      expect(achieved).toMatchObject({ status: 'ACHIEVED', progressBps: 10000, remainingCents: 0 });

      await api(c.ana).patch(`${c.goals}/${goal.id}`, { version: 99, name: 'Y' }).expect(409);
      await api(c.ana).post(`${c.goals}/${goal.id}/archive`).expect(200);
      const blocked = await api(c.ana)
        .post(`${c.goals}/${goal.id}/entries`, entry(c.brunoId, 1, '2026-10-10'))
        .expect(409);
      expect(blocked.body).toMatchObject({ error: { code: 'ARCHIVED' } });
      const restored = (await api(c.ana).post(`${c.goals}/${goal.id}/restore`).expect(200))
        .body as Goal;
      expect(restored.status).toBe('ACHIEVED');

      const other = await couple();
      await api(other.ana).get(`${c.goals}/${goal.id}`).expect(404);
      await api(other.ana).get(`${other.goals}/${goal.id}`).expect(404);
    });
  });

  describe('purchase plans', () => {
    it('tracks estimate vs actual, remaining need and goal coverage (FR-PP-01..04)', async () => {
      const c = await couple();
      const goal = (
        await api(c.ana)
          .post(c.goals, {
            name: 'Casita',
            targetAmountCents: 1_000_000,
            participantMemberIds: [c.anaId],
          })
          .expect(201)
      ).body as Goal;
      await api(c.ana)
        .post(`${c.goals}/${goal.id}/entries`, entry(c.anaId, 185_000, '2026-10-01'))
        .expect(201);
      const plan = (await api(c.ana).post(c.plans, { name: 'Casita', goalId: goal.id }).expect(201))
        .body as Plan;
      const items = `${c.plans}/${plan.id}/items`;
      const item = (name: string, estimatedPriceCents: number, extra: object = {}) =>
        api(c.ana)
          .post(items, {
            name,
            estimatedPriceCents,
            quantity: 1,
            priority: 'MEDIUM',
            status: 'PENDING',
            ...extra,
          })
          .expect(201);
      await item('Sofá', 250_000, { priority: 'HIGH' });
      await item('Cadeiras', 30_000, { quantity: 4, priority: 'LOW' });
      await item('Piano', 900_000, { status: 'FUTURE' });
      const withFridge = (
        await item('Geladeira', 400_000, { url: 'https://example.com/geladeira' })
      ).body as Plan;
      const fridge = withFridge.items?.find((i) => i.name === 'Geladeira');

      // The purchase links an expense recorded separately.
      const expense = (
        await api(c.ana)
          .post(`/households/${c.h}/transactions`, {
            description: 'Geladeira',
            amountCents: 379_900,
            date: '2026-10-10',
            categoryId: c.categoryId,
            payerMemberId: c.anaId,
            paymentMethod: 'PIX',
          })
          .expect(201)
      ).body as { id: string };
      const bought = (
        await api(c.ana)
          .post(`${items}/${fridge?.id ?? ''}/purchase`, {
            paidPriceCents: 379_900,
            purchasedAt: '2026-10-10',
            transactionId: expense.id,
          })
          .expect(200)
      ).body as Plan;

      expect(bought.totals).toEqual({
        estimatedCents: 250_000 + 120_000 + 400_000,
        futureCents: 900_000,
        actualCents: 379_900,
        remainingNeedCents: 370_000,
        varianceCents: -20_100,
        pendingCount: 2,
        purchasedCount: 1,
        futureCount: 1,
      });
      expect(bought.goal).toEqual({
        id: goal.id,
        name: 'Casita',
        savedCents: 185_000,
        coverageBps: 5000,
      });
      expect(bought.items?.map((i) => [i.name, i.status])).toEqual([
        ['Sofá', 'PENDING'],
        ['Cadeiras', 'PENDING'],
        ['Geladeira', 'PURCHASED'],
        ['Piano', 'FUTURE'],
      ]);
      expect(bought.items?.[2]?.transaction).toMatchObject({
        id: expense.id,
        amountCents: 379_900,
      });

      // A linked expense deleted later shows as unlinked.
      await api(c.ana).delete(`/households/${c.h}/transactions/${expense.id}`).expect(204);
      const after = (await api(c.ana).get(`${c.plans}/${plan.id}`).expect(200)).body as Plan;
      expect(after.items?.[2]?.transaction).toBeNull();
      expect(after.items?.[2]?.paidPriceCents).toBe(379_900);
    });

    it('validates purchases and status changes; undo and delete items', async () => {
      const c = await couple();
      const plan = (await api(c.ana).post(c.plans, { name: 'Escritório' }).expect(201))
        .body as Plan;
      const items = `${c.plans}/${plan.id}/items`;
      const created = (
        await api(c.ana)
          .post(items, {
            name: 'Mesa',
            estimatedPriceCents: 80_000,
            quantity: 1,
            priority: 'HIGH',
            status: 'PENDING',
          })
          .expect(201)
      ).body as Plan;
      const mesa = created.items?.[0];
      const id = mesa?.id ?? '';

      await api(c.ana)
        .post(`${items}/${id}/purchase`, {
          paidPriceCents: 1,
          transactionId: '0199a0b0-0000-7000-8000-000000000000',
        })
        .expect(400);
      await api(c.ana)
        .post(`${items}/${id}/purchase`, { paidPriceCents: 1, purchasedAt: '2026-10-16' })
        .expect(400);
      await api(c.ana)
        .post(items, {
          name: 'X',
          estimatedPriceCents: 1,
          quantity: 1,
          priority: 'HIGH',
          status: 'PURCHASED',
        })
        .expect(400);

      const bought = (
        await api(c.ana).post(`${items}/${id}/purchase`, { paidPriceCents: 75_000 }).expect(200)
      ).body as Plan;
      expect(bought.status).toBe('COMPLETED');
      expect(bought.items?.[0]).toMatchObject({
        purchasedAt: '2026-10-15',
        paidPriceCents: 75_000,
      });
      await api(c.ana)
        .patch(`${items}/${id}`, { version: bought.items?.[0]?.version ?? 0, status: 'FUTURE' })
        .expect(400);
      await api(c.ana).patch(`${items}/${id}`, { version: 1, name: 'Mesa grande' }).expect(409);

      const undone = (await api(c.ana).post(`${items}/${id}/unpurchase`).expect(200)).body as Plan;
      expect(undone.items?.[0]).toMatchObject({
        status: 'PENDING',
        paidPriceCents: null,
        purchasedAt: null,
      });
      expect(undone.status).toBe('ACTIVE');

      const deleted = (await api(c.ana).delete(`${items}/${id}`).expect(200)).body as Plan;
      expect(deleted.items).toEqual([]);
      await api(c.ana).post(`${items}/${id}/restore`).expect(200);

      await api(c.ana).post(`${c.plans}/${plan.id}/archive`).expect(200);
      const blocked = await api(c.ana)
        .post(items, {
          name: 'Y',
          estimatedPriceCents: 1,
          quantity: 1,
          priority: 'LOW',
          status: 'PENDING',
        })
        .expect(409);
      expect(blocked.body).toMatchObject({ error: { code: 'ARCHIVED' } });
    });

    it('links only open goals of the household, audits and isolates plans', async () => {
      const c = await couple();
      const goal = (
        await api(c.ana)
          .post(c.goals, { name: 'Meta', targetAmountCents: 1000, participantMemberIds: [c.anaId] })
          .expect(201)
      ).body as Goal;
      await api(c.ana).post(`${c.goals}/${goal.id}/archive`).expect(200);
      await api(c.ana).post(c.plans, { name: 'P', goalId: goal.id }).expect(400);
      const other = await couple();
      const foreignGoal = (
        await api(other.ana)
          .post(other.goals, {
            name: 'G',
            targetAmountCents: 1000,
            participantMemberIds: [other.anaId],
          })
          .expect(201)
      ).body as Goal;
      await api(c.ana).post(c.plans, { name: 'P', goalId: foreignGoal.id }).expect(400);

      const plan = (await api(c.ana).post(c.plans, { name: 'P' }).expect(201)).body as Plan;
      await api(c.ana)
        .patch(`${c.plans}/${plan.id}`, { version: plan.version, goalId: null })
        .expect(200);
      const rows: { n: string }[] = await app
        .get(DataSource)
        .query(
          `SELECT count(*) AS n FROM audit_events WHERE household_id = $1 AND entity_type = 'PURCHASE_PLAN'`,
          [c.h],
        );
      expect(rows[0]?.n).toBe('2');
      await api(other.ana).get(`${c.plans}/${plan.id}`).expect(404);
      await api(other.ana).get(`${other.plans}/${plan.id}`).expect(404);
    });
  });
});
