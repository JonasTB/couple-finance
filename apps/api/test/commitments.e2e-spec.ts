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
interface Category {
  id: string;
  name: string;
  children: Category[];
}
interface Occurrence {
  recurringExpenseId: string;
  occurrenceDate: string;
  status: string;
  expectedAmountCents: number;
  transactionId: string | null;
  amountCents: number | null;
}
interface Recurring {
  id: string;
  status: string;
  version: number;
  nextOccurrenceDate: string | null;
  scheduleLocked: boolean;
  pauses: { from: string; to: string | null }[];
  endDate: string | null;
  expectedAmountCents: number;
}
interface Transaction {
  id: string;
  amountCents: number;
  date: string;
  description: string;
  notes: string | null;
  split: { type: string; weights: { memberId: string; weight: number }[] };
  allocations: { memberId: string; amountCents: number }[];
  origin: Record<string, unknown> | null;
  deletedAt: string | null;
}
interface Plan {
  id: string;
  status: string;
  originalTotalCents: number;
  totalCents: number;
  paidCount: number;
  paidCents: number;
  remainingCount: number;
  remainingCents: number;
  installmentAmountCents: number;
  nextInstallment: { number: number; date: string; amountCents: number } | null;
  releaseMonth: string | null;
  installments?: {
    number: number;
    transactionId: string;
    date: string;
    amountCents: number;
    status: string;
    payoff: boolean;
  }[];
}

// "Today" is 15 Oct 2026 in São Paulo for the whole suite.
const NOW = new Date('2026-10-15T15:00:00Z');

describe('Recurring expenses and installments (e2e)', () => {
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

  /** New access token after moving the clock (tokens live 15 minutes). */
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
    const ana = await newUser('com-ana');
    const bruno = await newUser('com-bruno');
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
    const moradia = categories.find((c) => c.name === 'Moradia');
    return {
      ana,
      bruno,
      h,
      anaId: body.me.memberId,
      brunoId: members.find((m) => !m.isMe)?.id ?? '',
      internetId: moradia?.children.find((c) => c.name === 'Internet e telefone')?.id ?? '',
      eletroId:
        categories
          .find((c) => c.name === 'Casa e decoração')
          ?.children.find((c) => c.name === 'Eletrodomésticos')?.id ?? '',
      rec: `/households/${h}/recurring-expenses`,
      plans: `/households/${h}/installment-plans`,
      tx: `/households/${h}/transactions`,
    };
  };

  const occurrences = async (user: TestUser, rec: string, from: string, to: string) =>
    (await api(user).get(`${rec}/occurrences?from=${from}&to=${to}`).expect(200))
      .body as Occurrence[];

  describe('recurring expenses', () => {
    const internet = (c: Awaited<ReturnType<typeof couple>>, extra: object = {}) => ({
      description: 'Internet',
      categoryId: c.internetId,
      expectedAmountCents: 12000,
      amountType: 'VARIABLE',
      frequency: 'MONTHLY',
      interval: 1,
      startDate: '2026-08-10',
      payerMemberId: c.anaId,
      paymentMethod: 'BOLETO',
      ...extra,
    });

    it('projects occurrences without creating records (FR-REC-02/05)', async () => {
      const c = await couple();
      const created = (await api(c.ana).post(c.rec, internet(c)).expect(201)).body as Recurring;
      expect(created).toMatchObject({
        status: 'ACTIVE',
        nextOccurrenceDate: '2026-11-10',
        scheduleLocked: false,
      });
      const list = await occurrences(c.ana, c.rec, '2026-08-01', '2026-12-31');
      expect(list.map((o) => [o.occurrenceDate, o.status])).toEqual([
        ['2026-08-10', 'OVERDUE'],
        ['2026-09-10', 'OVERDUE'],
        ['2026-10-10', 'OVERDUE'],
        ['2026-11-10', 'UPCOMING'],
        ['2026-12-10', 'UPCOMING'],
      ]);
      // Projection creates nothing.
      const txs = (await api(c.ana).get(c.tx).expect(200)).body as { data: unknown[] };
      expect(txs.data).toEqual([]);

      await api(c.ana).get(`${c.rec}/occurrences?from=2026-01-01&to=2028-01-01`).expect(400);
      await api(c.ana).get(`${c.rec}/occurrences?from=2026-05-01&to=2026-04-01`).expect(400);
    });

    it('confirms an occurrence once, with the actual amount (FR-REC-03)', async () => {
      const c = await couple();
      const r = (await api(c.ana).post(c.rec, internet(c)).expect(201)).body as Recurring;
      const confirmed = await api(c.bruno)
        .post(`${c.rec}/${r.id}/occurrences/2026-08-10/confirm`, {
          amountCents: 13099,
          date: '2026-08-12',
          payerMemberId: c.brunoId,
        })
        .expect(201);
      const txId = (confirmed.body as { transactionId: string }).transactionId;
      const tx = (await api(c.ana).get(`${c.tx}/${txId}`).expect(200)).body as Transaction;
      expect(tx).toMatchObject({
        description: 'Internet',
        amountCents: 13099,
        date: '2026-08-12',
        origin: { kind: 'RECURRING', recurringExpenseId: r.id, occurrenceDate: '2026-08-10' },
        // Household default (EQUAL), largest remainder.
        allocations: [
          { memberId: c.anaId, amountCents: 6550 },
          { memberId: c.brunoId, amountCents: 6549 },
        ],
      });

      const again = await api(c.ana)
        .post(`${c.rec}/${r.id}/occurrences/2026-08-10/confirm`, {})
        .expect(409);
      expect(again.body).toMatchObject({ error: { code: 'OCCURRENCE_ALREADY_CONFIRMED' } });
      const wrongDay = await api(c.ana)
        .post(`${c.rec}/${r.id}/occurrences/2026-08-11/confirm`, {})
        .expect(422);
      expect(wrongDay.body).toMatchObject({ error: { code: 'OCCURRENCE_NOT_SCHEDULED' } });
      await api(c.ana).post(`${c.rec}/${r.id}/occurrences/2026-02-30/confirm`, {}).expect(404);

      const list = await occurrences(c.ana, c.rec, '2026-08-01', '2026-08-31');
      expect(list).toEqual([
        expect.objectContaining({ status: 'CONFIRMED', transactionId: txId, amountCents: 13099 }),
      ]);
      const view = (await api(c.ana).get(`${c.rec}/${r.id}`).expect(200)).body as Recurring;
      expect(view.scheduleLocked).toBe(true);
    });

    it('prevents duplicates under concurrent confirmations', async () => {
      const c = await couple();
      const r = (await api(c.ana).post(c.rec, internet(c)).expect(201)).body as Recurring;
      const path = `${c.rec}/${r.id}/occurrences/2026-09-10/confirm`;
      const results = await Promise.all([
        api(c.ana).post(path, {}),
        api(c.bruno).post(path, {}),
        api(c.ana).post(path, {}),
      ]);
      expect(results.map((res) => res.status).sort()).toEqual([201, 409, 409]);
    });

    it('skips and reopens occurrences; deleting the expense reopens it too', async () => {
      const c = await couple();
      const r = (await api(c.ana).post(c.rec, internet(c)).expect(201)).body as Recurring;
      const base = `${c.rec}/${r.id}/occurrences`;
      await api(c.ana).post(`${base}/2026-09-10/skip`).expect(204);
      await api(c.ana).post(`${base}/2026-09-10/skip`).expect(204); // idempotent
      let list = await occurrences(c.ana, c.rec, '2026-09-01', '2026-09-30');
      expect(list[0]?.status).toBe('SKIPPED');
      await api(c.ana).delete(`${base}/2026-09-10/skip`).expect(204);
      list = await occurrences(c.ana, c.rec, '2026-09-01', '2026-09-30');
      expect(list[0]?.status).toBe('OVERDUE');

      // Confirming a skipped occurrence un-skips it.
      await api(c.ana).post(`${base}/2026-09-10/skip`).expect(204);
      const { transactionId } = (
        await api(c.ana).post(`${base}/2026-09-10/confirm`, {}).expect(201)
      ).body as { transactionId: string };
      list = await occurrences(c.ana, c.rec, '2026-09-01', '2026-09-30');
      expect(list[0]?.status).toBe('CONFIRMED');
      const skipConfirmed = await api(c.ana).post(`${base}/2026-09-10/skip`).expect(409);
      expect(skipConfirmed.body).toMatchObject({ error: { code: 'OCCURRENCE_ALREADY_CONFIRMED' } });

      // Deleting the expense reopens the occurrence; restoring after re-confirming conflicts.
      await api(c.ana).delete(`${c.tx}/${transactionId}`).expect(204);
      list = await occurrences(c.ana, c.rec, '2026-09-01', '2026-09-30');
      expect(list[0]?.status).toBe('OVERDUE');
      await api(c.ana).post(`${base}/2026-09-10/confirm`, {}).expect(201);
      const restore = await api(c.ana).post(`${c.tx}/${transactionId}/restore`).expect(409);
      expect(restore.body).toMatchObject({ error: { code: 'OCCURRENCE_ALREADY_CONFIRMED' } });
    });

    it('edits apply to open occurrences; the schedule locks after a confirmation', async () => {
      const c = await couple();
      const r = (await api(c.ana).post(c.rec, internet(c)).expect(201)).body as Recurring;
      // Before any confirmation the schedule may change.
      const moved = (
        await api(c.ana)
          .patch(`${c.rec}/${r.id}`, { version: r.version, startDate: '2026-08-05' })
          .expect(200)
      ).body as Recurring;
      const { transactionId } = (
        await api(c.ana).post(`${c.rec}/${r.id}/occurrences/2026-08-05/confirm`, {}).expect(201)
      ).body as { transactionId: string };

      const locked = await api(c.ana)
        .patch(`${c.rec}/${r.id}`, { version: moved.version, frequency: 'WEEKLY' })
        .expect(409);
      expect(locked.body).toMatchObject({ error: { code: 'RECURRENCE_SCHEDULE_LOCKED' } });
      await api(c.ana)
        .patch(`${c.rec}/${r.id}`, { version: moved.version + 99, expectedAmountCents: 1 })
        .expect(409);

      await api(c.ana)
        .patch(`${c.rec}/${r.id}`, { version: moved.version, expectedAmountCents: 15000 })
        .expect(200);
      const list = await occurrences(c.ana, c.rec, '2026-08-01', '2026-09-30');
      expect(list.map((o) => o.expectedAmountCents)).toEqual([15000, 15000]);
      const tx = (await api(c.ana).get(`${c.tx}/${transactionId}`).expect(200)).body as Transaction;
      expect(tx.amountCents).toBe(12000); // confirmed history unchanged
    });

    it('pauses, resumes and ends (FR-REC-04)', async () => {
      const c = await couple();
      const r = (await api(c.ana).post(c.rec, internet(c)).expect(201)).body as Recurring;
      const paused = (await api(c.ana).post(`${c.rec}/${r.id}/pause`).expect(200))
        .body as Recurring;
      expect(paused).toMatchObject({ status: 'PAUSED', nextOccurrenceDate: null });
      await api(c.ana).post(`${c.rec}/${r.id}/pause`).expect(409);
      // Overdue occurrences before the pause remain; later ones are not expected.
      let list = await occurrences(c.ana, c.rec, '2026-10-01', '2026-12-31');
      expect(list.map((o) => o.occurrenceDate)).toEqual(['2026-10-10']);
      const blocked = await api(c.ana)
        .post(`${c.rec}/${r.id}/occurrences/2026-11-10/confirm`, {})
        .expect(422);
      expect(blocked.body).toMatchObject({ error: { code: 'OCCURRENCE_NOT_SCHEDULED' } });

      // Forty days later (25 Nov) it resumes: 10 Nov stays out, 10 Dec is expected again.
      clock.set(new Date('2026-11-24T15:00:00Z'));
      await relogin(c.ana);
      const resumed = (await api(c.ana).post(`${c.rec}/${r.id}/resume`).expect(200))
        .body as Recurring;
      expect(resumed).toMatchObject({
        status: 'ACTIVE',
        pauses: [{ from: '2026-10-15', to: '2026-11-24' }],
        nextOccurrenceDate: '2026-12-10',
      });
      list = await occurrences(c.ana, c.rec, '2026-10-01', '2026-12-31');
      expect(list.map((o) => [o.occurrenceDate, o.status])).toEqual([
        ['2026-10-10', 'OVERDUE'],
        ['2026-12-10', 'UPCOMING'],
      ]);

      const ended = (
        await api(c.ana).post(`${c.rec}/${r.id}/end`, { lastDate: '2026-12-31' }).expect(200)
      ).body as Recurring;
      expect(ended.endDate).toBe('2026-12-31');
      list = await occurrences(c.ana, c.rec, '2026-12-01', '2027-03-31');
      expect(list.map((o) => o.occurrenceDate)).toEqual(['2026-12-10']);
      await api(c.ana).post(`${c.rec}/${r.id}/end`, { lastDate: '2026-01-01' }).expect(400);
    });

    it('validates templates and keeps confirmed expenses after deletion', async () => {
      const c = await couple();
      await api(c.ana)
        .post(c.rec, internet(c, { split: { type: 'CUSTOM_AMOUNT', amounts: [] } }))
        .expect(400);
      await api(c.ana)
        .post(c.rec, internet(c, { endDate: '2026-08-01' }))
        .expect(400);
      await api(c.ana)
        .post(c.rec, internet(c, { interval: 13 }))
        .expect(400);
      await api(c.ana)
        .post(
          c.rec,
          internet(c, {
            split: { type: 'CUSTOM_PERCENT', weights: [{ memberId: c.anaId, bps: 9000 }] },
          }),
        )
        .expect(400);

      const r = (
        await api(c.ana)
          .post(
            c.rec,
            internet(c, { split: { type: 'INDIVIDUAL', responsibleMemberId: c.brunoId } }),
          )
          .expect(201)
      ).body as Recurring;
      const { transactionId } = (
        await api(c.ana).post(`${c.rec}/${r.id}/occurrences/2026-10-10/confirm`, {}).expect(201)
      ).body as { transactionId: string };
      await api(c.ana).delete(`${c.rec}/${r.id}`).expect(204);
      expect((await api(c.ana).get(c.rec).expect(200)).body).toEqual([]);
      expect((await occurrences(c.ana, c.rec, '2026-10-01', '2026-10-31')).length).toBe(0);
      const tx = (await api(c.ana).get(`${c.tx}/${transactionId}`).expect(200)).body as Transaction;
      expect(tx.deletedAt).toBeNull();
      expect(tx.allocations).toEqual([{ memberId: c.brunoId, amountCents: 12000 }]);
      await api(c.ana).post(`${c.rec}/${r.id}/restore`).expect(200);

      const other = await couple();
      await api(other.ana).get(`${c.rec}/${r.id}`).expect(404);
      await api(other.ana).get(`${other.rec}/${r.id}`).expect(404);
      await api(other.ana)
        .post(`${other.rec}/${r.id}/occurrences/2026-11-10/confirm`, {})
        .expect(404);
    });
  });

  describe('installment plans', () => {
    const fridge = (c: Awaited<ReturnType<typeof couple>>, extra: object = {}) => ({
      description: 'Geladeira',
      categoryId: c.eletroId,
      totalAmountCents: 100000,
      installmentCount: 3,
      firstInstallmentDate: '2026-09-30',
      payerMemberId: c.anaId,
      paymentMethod: 'CREDIT_CARD',
      ...extra,
    });

    it('creates every installment with the remainder on the first (FR-INST-01/02)', async () => {
      const c = await couple();
      const plan = (await api(c.ana).post(c.plans, fridge(c)).expect(201)).body as Plan;
      expect(plan).toMatchObject({
        status: 'ACTIVE',
        originalTotalCents: 100000,
        totalCents: 100000,
        installmentAmountCents: 33333,
        paidCount: 1,
        paidCents: 33334,
        remainingCount: 2,
        remainingCents: 66666,
        nextInstallment: { number: 2, date: '2026-10-30', amountCents: 33333 },
        releaseMonth: '2026-12',
      });
      expect(plan.installments?.map((i) => [i.number, i.date, i.amountCents, i.status])).toEqual([
        [1, '2026-09-30', 33334, 'PAID'],
        // Always from the first date: 30 Sep → 30 Oct → 30 Nov.
        [2, '2026-10-30', 33333, 'REMAINING'],
        [3, '2026-11-30', 33333, 'REMAINING'],
      ]);
      const tx = (
        await api(c.ana)
          .get(`${c.tx}/${plan.installments?.[1]?.transactionId ?? ''}`)
          .expect(200)
      ).body as Transaction;
      expect(tx.origin).toEqual({
        kind: 'INSTALLMENT',
        installmentPlanId: plan.id,
        installmentNumber: 2,
        installmentCount: 3,
        payoff: false,
      });
      expect(tx.allocations.reduce((sum, a) => sum + a.amountCents, 0)).toBe(33333);

      for (const body of [
        fridge(c, { installmentCount: 1 }),
        fridge(c, { installmentCount: 73 }),
        fridge(c, { installmentAmountCents: 100 }),
        fridge(c, { totalAmountCents: 2 }),
        fridge(c, { split: { type: 'CUSTOM_AMOUNT', amounts: [] } }),
      ]) {
        await api(c.ana).post(c.plans, body).expect(400);
      }
    });

    it('keeps one income basis for every installment (CALCULATIONS §5)', async () => {
      const c = await couple();
      const incomes = `/households/${c.h}/incomes/me`;
      await api(c.ana)
        .post(incomes, { monthlyAmountCents: 600000, effectiveFrom: '2026-01-01' })
        .expect(201);
      await api(c.bruno)
        .post(incomes, { monthlyAmountCents: 400000, effectiveFrom: '2026-01-01' })
        .expect(201);
      const plan = (
        await api(c.ana)
          .post(
            c.plans,
            fridge(c, {
              description: 'Sofá',
              totalAmountCents: undefined,
              installmentAmountCents: 42000,
              installmentCount: 10,
              firstInstallmentDate: '2026-03-15',
              split: { type: 'INCOME_PROPORTIONAL' },
            }),
          )
          .expect(201)
      ).body as Plan;
      // A later income change does not touch any installment.
      await api(c.bruno)
        .post(incomes, { monthlyAmountCents: 600000, effectiveFrom: '2026-06-01' })
        .expect(201);
      const last = (
        await api(c.ana)
          .get(`${c.tx}/${plan.installments?.[9]?.transactionId ?? ''}`)
          .expect(200)
      ).body as Transaction;
      expect(last.date).toBe('2026-12-15');
      expect(last.allocations).toEqual([
        { memberId: c.anaId, amountCents: 25200 },
        { memberId: c.brunoId, amountCents: 16800 },
      ]);

      const summary = (await api(c.ana).get(`${c.plans}/summary`).expect(200)).body as {
        months: { month: string; installmentsCents: number; activePlans: number }[];
        releases: { month: string; releasedCents: number }[];
      };
      expect(summary.months[0]).toEqual({
        month: '2026-10',
        installmentsCents: 42000,
        activePlans: 1,
      });
      expect(summary.months[2]).toEqual({
        month: '2026-12',
        installmentsCents: 42000,
        activePlans: 1,
      });
      expect(summary.months[3]?.installmentsCents).toBe(0);
      expect(summary.releases).toEqual([
        expect.objectContaining({ month: '2027-01', releasedCents: 42000 }),
      ]);
    });

    it('cancels remaining installments; deleting and restoring the plan is exact', async () => {
      const c = await couple();
      const plan = (await api(c.ana).post(c.plans, fridge(c)).expect(201)).body as Plan;
      const closed = (
        await api(c.ana).post(`${c.plans}/${plan.id}/close`, { kind: 'CANCEL' }).expect(200)
      ).body as Plan;
      expect(closed).toMatchObject({
        status: 'CANCELLED',
        totalCents: 33334,
        remainingCount: 0,
        releaseMonth: '2026-10',
      });
      const again = await api(c.ana)
        .post(`${c.plans}/${plan.id}/close`, { kind: 'CANCEL' })
        .expect(409);
      expect(again.body).toMatchObject({ error: { code: 'INSTALLMENT_PLAN_CLOSED' } });

      // Delete then restore brings back only the installment that was live.
      await api(c.ana).delete(`${c.plans}/${plan.id}`).expect(204);
      expect((await api(c.ana).get(c.plans).expect(200)).body).toEqual([]);
      const deleted = (await api(c.ana).get(`${c.tx}?deleted=only`).expect(200)).body as {
        data: Transaction[];
      };
      expect(deleted.data).toHaveLength(3);
      const restored = (await api(c.ana).post(`${c.plans}/${plan.id}/restore`).expect(200))
        .body as Plan;
      expect(restored.installments?.map((i) => i.number)).toEqual([1]);
      expect(restored.status).toBe('CANCELLED');
    });

    it('pays off early with one expense for the remaining installments (FR-INST-04)', async () => {
      const c = await couple();
      const plan = (
        await api(c.ana)
          .post(
            c.plans,
            fridge(c, {
              totalAmountCents: undefined,
              installmentAmountCents: 42000,
              installmentCount: 10,
              firstInstallmentDate: '2026-03-15',
            }),
          )
          .expect(201)
      ).body as Plan;
      await api(c.ana).post(`${c.plans}/${plan.id}/close`, { kind: 'PAY_OFF' }).expect(400);
      await api(c.ana)
        .post(`${c.plans}/${plan.id}/close`, { kind: 'CANCEL', date: '2026-12-31' })
        .expect(400);

      const paidOff = (
        await api(c.ana)
          .post(`${c.plans}/${plan.id}/close`, {
            kind: 'PAY_OFF',
            date: '2026-10-20',
            payoffAmountCents: 80000,
          })
          .expect(200)
      ).body as Plan;
      expect(paidOff).toMatchObject({
        status: 'PAID_OFF',
        totalCents: 8 * 42000 + 80000,
        paidCount: 8,
        remainingCount: 2, // the payoff (installments 9–10) is dated 20 Oct, after today
        releaseMonth: '2026-11',
      });
      const payoff = paidOff.installments?.find((i) => i.payoff);
      expect(payoff).toMatchObject({ number: 9, date: '2026-10-20', amountCents: 80000 });
      const tx = (
        await api(c.ana)
          .get(`${c.tx}/${payoff?.transactionId ?? ''}`)
          .expect(200)
      ).body as Transaction;
      expect(tx).toMatchObject({
        origin: { kind: 'INSTALLMENT', installmentNumber: 9, installmentCount: 10, payoff: true },
        allocations: [
          { memberId: c.anaId, amountCents: 40000 },
          { memberId: c.brunoId, amountCents: 40000 },
        ],
      });
      expect(tx.notes).toBe('Quitação antecipada das parcelas 9 a 10');
    });

    it('installments are ordinary spend on the dashboard', async () => {
      const c = await couple();
      await api(c.ana).post(c.plans, fridge(c)).expect(201);
      const dashboard = (
        await api(c.ana).get(`/households/${c.h}/dashboard?month=2026-10`).expect(200)
      ).body as { totals: { sharedSpendCents: number } };
      expect(dashboard.totals.sharedSpendCents).toBe(33333);
    });

    it('audits the plan and each installment, and hides it from other households', async () => {
      const c = await couple();
      const plan = (await api(c.ana).post(c.plans, fridge(c)).expect(201)).body as Plan;
      const rows: { entity_type: string; n: string }[] = await app.get(DataSource).query(
        `SELECT entity_type, count(*) AS n FROM audit_events WHERE household_id = $1
           AND entity_type IN ('INSTALLMENT_PLAN', 'TRANSACTION') GROUP BY entity_type ORDER BY 1`,
        [c.h],
      );
      expect(rows).toEqual([
        { entity_type: 'INSTALLMENT_PLAN', n: '1' },
        { entity_type: 'TRANSACTION', n: '3' },
      ]);
      const other = await couple();
      await api(other.ana).get(`${other.plans}/${plan.id}`).expect(404);
      await api(other.ana).post(`${other.plans}/${plan.id}/close`, { kind: 'CANCEL' }).expect(404);
      await api(other.ana).delete(`${other.plans}/${plan.id}`).expect(404);
    });
  });
});
