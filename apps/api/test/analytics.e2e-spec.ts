import { type INestApplication } from '@nestjs/common';
import { type AnalyticsView } from '@couple-finance/shared';
import request from 'supertest';
import { type App } from 'supertest/types';
import { CSRF, register, STRONG_PASSWORD, uniqueEmail } from './auth-helpers';
import { createTestApp, FakeClock } from './create-test-app';

interface TestUser {
  email: string;
  token: string;
}
interface Category {
  id: string;
  name: string;
  children: { id: string; name: string }[];
}

const JULY = new Date('2026-07-01T15:00:00Z');
const NOW = new Date('2026-10-15T15:00:00Z');

describe('Analytics (e2e)', () => {
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
    const ana = await newUser('an-ana');
    const bruno = await newUser('an-bruno');
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
    const categories = (await api(ana).get(`/households/${h}/categories`).expect(200))
      .body as Category[];
    const child = (parent: string, name: string) =>
      categories.find((c) => c.name === parent)?.children.find((c) => c.name === name)?.id ?? '';
    const top = (name: string) => categories.find((c) => c.name === name)?.id ?? '';
    return {
      ana,
      bruno,
      h,
      anaId: body.me.memberId,
      brunoId: members.find((m) => !m.isMe)?.id ?? '',
      internetId: child('Moradia', 'Internet e telefone'),
      supermercadoId: child('Mercado', 'Supermercado'),
      eletroId: child('Casa e decoração', 'Eletrodomésticos'),
      moradia: top('Moradia'),
      mercado: top('Mercado'),
      casa: top('Casa e decoração'),
      analytics: `/households/${h}/analytics`,
    };
  };

  /**
   * Aug–Oct 2026: incomes (Bruno's only from September), a confirmed monthly internet bill, a
   * 3-installment fridge, supermarket expenses, one individual and one deleted expense, a goal.
   */
  const seeded = async () => {
    clock.set(JULY);
    const c = await couple();
    const goal = (
      await api(c.ana)
        .post(`/households/${c.h}/goals`, {
          name: 'Reserva',
          targetAmountCents: 500_000,
          participantMemberIds: [c.anaId, c.brunoId],
        })
        .expect(201)
    ).body as { id: string };
    const archived = (
      await api(c.ana)
        .post(`/households/${c.h}/goals`, {
          name: 'Antiga',
          targetAmountCents: 100_000,
          participantMemberIds: [c.anaId],
        })
        .expect(201)
    ).body as { id: string };
    clock.set(NOW);
    await relogin(c.ana);
    await relogin(c.bruno);
    await api(c.ana).post(`/households/${c.h}/goals/${archived.id}/archive`).expect(200);
    const entries = `/households/${c.h}/goals/${goal.id}/entries`;
    await api(c.ana)
      .post(entries, {
        memberId: c.anaId,
        type: 'CONTRIBUTION',
        amountCents: 100_000,
        date: '2026-08-05',
      })
      .expect(201);
    await api(c.bruno)
      .post(entries, {
        memberId: c.brunoId,
        type: 'CONTRIBUTION',
        amountCents: 50_000,
        date: '2026-09-10',
      })
      .expect(201);

    const incomes = `/households/${c.h}/incomes/me`;
    await api(c.ana)
      .post(incomes, { monthlyAmountCents: 600_000, effectiveFrom: '2026-01-01' })
      .expect(201);
    await api(c.bruno)
      .post(incomes, { monthlyAmountCents: 400_000, effectiveFrom: '2026-09-01' })
      .expect(201);

    const rec = `/households/${c.h}/recurring-expenses`;
    const internet = (
      await api(c.ana)
        .post(rec, {
          description: 'Internet',
          categoryId: c.internetId,
          expectedAmountCents: 12_000,
          amountType: 'FIXED',
          frequency: 'MONTHLY',
          interval: 1,
          startDate: '2026-08-10',
          payerMemberId: c.anaId,
          paymentMethod: 'BOLETO',
        })
        .expect(201)
    ).body as { id: string };
    for (const date of ['2026-08-10', '2026-09-10', '2026-10-10']) {
      await api(c.ana).post(`${rec}/${internet.id}/occurrences/${date}/confirm`, {}).expect(201);
    }

    await api(c.bruno)
      .post(`/households/${c.h}/installment-plans`, {
        description: 'Geladeira',
        categoryId: c.eletroId,
        totalAmountCents: 90_000,
        installmentCount: 3,
        firstInstallmentDate: '2026-09-20',
        payerMemberId: c.brunoId,
        paymentMethod: 'CREDIT_CARD',
      })
      .expect(201);

    const tx = `/households/${c.h}/transactions`;
    const expense = (payerMemberId: string, amountCents: number, date: string, extra = {}) => ({
      description: 'Supermercado',
      amountCents,
      date,
      categoryId: c.supermercadoId,
      payerMemberId,
      paymentMethod: 'PIX',
      split: { type: 'EQUAL' },
      ...extra,
    });
    await api(c.bruno)
      .post(tx, expense(c.brunoId, 50_000, '2026-08-12'))
      .expect(201);
    await api(c.ana)
      .post(tx, expense(c.anaId, 70_000, '2026-09-12'))
      .expect(201);
    await api(c.bruno)
      .post(tx, expense(c.brunoId, 40_000, '2026-10-05'))
      .expect(201);
    await api(c.ana)
      .post(
        tx,
        expense(c.anaId, 9_900, '2026-10-06', {
          split: { type: 'INDIVIDUAL', responsibleMemberId: c.anaId },
        }),
      )
      .expect(201);
    const deleted = (
      await api(c.ana)
        .post(tx, expense(c.anaId, 99_999, '2026-09-20'))
        .expect(201)
    ).body as { id: string };
    await api(c.ana).delete(`${tx}/${deleted.id}`).expect(204);
    return { ...c, goalId: goal.id };
  };

  const view = async (user: TestUser, path: string) =>
    (await api(user).get(path).expect(200)).body as AnalyticsView;

  it('computes the monthly trend, fixed vs variable, installment load and comparisons', async () => {
    const c = await seeded();
    const result = await view(c.ana, `${c.analytics}?month=2026-10&months=3`);

    expect(result).toMatchObject({
      from: '2026-08',
      to: '2026-10',
      currency: 'BRL',
      hasAnyTransactions: true,
      incomeVisible: false,
    });
    expect(
      result.months.map((m) => [
        m.month,
        m.period,
        m.sharedSpendCents,
        m.recurringCents,
        m.installmentCents,
        m.otherCents,
        m.changeCents,
        m.changeBps,
        m.individualSpendCents,
      ]),
    ).toEqual([
      ['2026-08', 'PAST', 62_000, 12_000, 0, 50_000, null, null, 0],
      ['2026-09', 'PAST', 112_000, 12_000, 30_000, 70_000, 50_000, 8064, 0],
      ['2026-10', 'CURRENT', 82_000, 12_000, 30_000, 40_000, -30_000, -2678, 9_900],
    ]);
    // Only closed months since the first expense (August and September) are averaged.
    expect(result.averages).toEqual({
      months: 2,
      sharedSpendCents: 87_000,
      fixedCents: 27_000,
      installmentCents: 15_000,
      otherCents: 60_000,
    });
    expect(result.comparison).toMatchObject({
      month: '2026-10',
      period: 'CURRENT',
      sharedSpendCents: 82_000,
      previousCents: 112_000,
      changeCents: -30_000,
      changeBps: -2678,
      averageMonths: 2,
      averageCents: 87_000,
      vsAverageCents: -5_000,
      vsAverageBps: -574,
    });
    expect(
      result.comparison.categories.map((x) => [x.categoryId, x.cents, x.averageCents]),
    ).toEqual([
      [c.mercado, 40_000, 60_000],
      [c.casa, 30_000, 15_000],
      [c.moradia, 12_000, 12_000],
    ]);
    expect(
      result.categories.map((x) => [x.categoryId, x.totalCents, x.shareBps, x.monthlyCents]),
    ).toEqual([
      [c.mercado, 160_000, 6250, [50_000, 70_000, 40_000]],
      [c.casa, 60_000, 2344, [0, 30_000, 30_000]],
      [c.moradia, 36_000, 1406, [12_000, 12_000, 12_000]],
    ]);
  });

  it('shows paid vs planned shares per month', async () => {
    const c = await seeded();
    const october = (await view(c.bruno, `${c.analytics}?month=2026-10&months=1`)).months[0];
    expect(october?.members).toEqual([
      {
        memberId: c.anaId,
        paidSharedCents: 12_000,
        responsibleSharedCents: 41_000,
        paidShareBps: 1463,
        responsibleShareBps: 5000,
        deviationBps: -3537,
      },
      {
        memberId: c.brunoId,
        paidSharedCents: 70_000,
        responsibleSharedCents: 41_000,
        paidShareBps: 8537,
        responsibleShareBps: 5000,
        deviationBps: 3537,
      },
    ]);
  });

  it('relates spend to income and shows the amount only when partners share it (ADR-005)', async () => {
    const c = await seeded();
    const path = `${c.analytics}?month=2026-10&months=3`;
    const hidden = await view(c.ana, path);
    expect(hidden.months.map((m) => m.income)).toEqual([
      // Bruno has no income in August: no ratio.
      { complete: false, incomeCents: null, fixedBps: null, spendBps: null },
      { complete: true, incomeCents: null, fixedBps: 420, spendBps: 1120 },
      { complete: true, incomeCents: null, fixedBps: 420, spendBps: 820 },
    ]);

    await api(c.bruno)
      .patch(`/households/${c.h}/members/me`, { incomeVisibility: 'EXACT' })
      .expect(204);
    const shown = await view(c.ana, path);
    expect(shown.incomeVisible).toBe(true);
    expect(shown.months.map((m) => m.income.incomeCents)).toEqual([null, 1_000_000, 1_000_000]);
    // Ana keeps hers RATIO_ONLY, so Bruno still sees ratios only.
    const forBruno = await view(c.bruno, path);
    expect(forBruno.incomeVisible).toBe(false);
    expect(forBruno.months[2]?.income).toEqual({
      complete: true,
      incomeCents: null,
      fixedBps: 420,
      spendBps: 820,
    });
  });

  it('tracks goal evolution and leaves archived goals out', async () => {
    const c = await seeded();
    const result = await view(c.ana, `${c.analytics}?month=2026-10&months=6`);
    expect(result.from).toBe('2026-05');
    expect(result.goals).toEqual([
      {
        goalId: c.goalId,
        name: 'Reserva',
        targetAmountCents: 500_000,
        status: 'ACTIVE',
        // Created in July: nothing before it.
        savedCents: [null, null, 0, 100_000, 150_000, 150_000],
      },
    ]);
  });

  it('defaults to 12 months ending in the current month and validates the query', async () => {
    const c = await couple();
    const empty = await view(c.ana, c.analytics);
    expect(empty).toMatchObject({ from: '2025-11', to: '2026-10', hasAnyTransactions: false });
    expect(empty.months).toHaveLength(12);
    expect(empty.months.every((m) => m.sharedSpendCents === 0)).toBe(true);
    expect(empty.averages.months).toBe(0);
    expect(empty.comparison).toMatchObject({
      averageMonths: 0,
      averageCents: null,
      changeBps: null,
    });

    for (const query of ['months=25', 'months=0', 'months=abc', 'month=2026-13']) {
      await api(c.ana).get(`${c.analytics}?${query}`).expect(400);
    }
    await api(c.ana).get(`${c.analytics}?months=24`).expect(200);

    const stranger = await newUser('an-stranger');
    await api(stranger).get(c.analytics).expect(404);
  });
});
