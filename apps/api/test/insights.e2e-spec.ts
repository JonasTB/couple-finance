import { type INestApplication } from '@nestjs/common';
import { type InsightView, type InsightsView } from '@couple-finance/shared';
import request from 'supertest';
import { type App } from 'supertest/types';
import { register, uniqueEmail } from './auth-helpers';
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

const NOW = new Date('2026-10-15T15:00:00Z');

describe('Insights (e2e)', () => {
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
    delete: (path: string) =>
      request(server).delete(`/api/v1${path}`).set('Authorization', `Bearer ${user.token}`),
  });

  /**
   * Jul–Oct 2026: supermarket R$ 500/month paid by Bruno, then R$ 900 by Ana in October; leisure
   * R$ 300 in September; a 3-installment TV from September (released in December); a R$ 1.000
   * supermarket budget from October.
   */
  const seeded = async () => {
    const ana = await newUser('in-ana');
    const bruno = await newUser('in-bruno');
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
    const anaId = body.me.memberId;
    const brunoId = members.find((m) => !m.isMe)?.id ?? '';
    const categories = (await api(ana).get(`/households/${h}/categories`).expect(200))
      .body as Category[];
    const top = (name: string) => categories.find((c) => c.name === name);
    const child = (parent: string, name: string) =>
      top(parent)?.children.find((c) => c.name === name)?.id ?? '';
    const mercado = top('Mercado')?.id ?? '';
    const casa = top('Casa e decoração')?.id ?? '';

    const tx = `/households/${h}/transactions`;
    const expense = (categoryId: string, payer: string, amountCents: number, date: string) =>
      api(ana)
        .post(tx, {
          description: 'Despesa',
          amountCents,
          date,
          categoryId,
          payerMemberId: payer,
          paymentMethod: 'PIX',
          split: { type: 'EQUAL' },
        })
        .expect(201);
    const supermercado = child('Mercado', 'Supermercado');
    for (const date of ['2026-07-05', '2026-08-05', '2026-09-05']) {
      await expense(supermercado, brunoId, 50_000, date);
    }
    await expense(child('Lazer', 'Passeios e eventos'), anaId, 30_000, '2026-09-12');
    await expense(supermercado, anaId, 90_000, '2026-10-05');
    const plan = (
      await api(bruno)
        .post(`/households/${h}/installment-plans`, {
          description: 'TV',
          categoryId: child('Casa e decoração', 'Eletrodomésticos'),
          totalAmountCents: 60_000,
          installmentCount: 3,
          firstInstallmentDate: '2026-09-20',
          payerMemberId: brunoId,
          paymentMethod: 'CREDIT_CARD',
        })
        .expect(201)
    ).body as { id: string };
    await api(ana)
      .post(`/households/${h}/budgets/changes`, {
        categoryId: mercado,
        amountCents: 100_000,
        fromMonth: '2026-10',
      })
      .expect(200);
    return {
      ana,
      bruno,
      h,
      anaId,
      brunoId,
      mercado,
      casa,
      planId: plan.id,
      insights: `/households/${h}/insights`,
    };
  };

  const view = async (user: TestUser, path: string) =>
    (await api(user).get(path).expect(200)).body as InsightsView;
  const summary = (insights: InsightView[]) =>
    insights.map((i) => [i.fingerprint, i.severity, i.dismissedAt]);

  it('evaluates the current month with evidence, thresholds and order (FR-INS-01/02)', async () => {
    const c = await seeded();
    const october = await view(c.ana, c.insights);
    expect(october).toMatchObject({ month: '2026-10', period: 'CURRENT' });
    expect(summary(october.insights)).toEqual([
      [`BUDGET_NEAR_LIMIT:2026-10:${c.mercado}:WARNING`, 'ATTENTION', null],
      [`CATEGORY_ABOVE_AVERAGE:2026-10:${c.mercado}`, 'ATTENTION', null],
      [`CATEGORY_ABOVE_AVERAGE:2026-10:${c.casa}`, 'ATTENTION', null],
      [`CONTRIBUTION_DEVIATION:2026-10:${c.anaId}`, 'INFO', null],
      [`DOMINANT_CATEGORY:2026-10:${c.mercado}`, 'INFO', null],
      [`INSTALLMENT_ENDING:2026-10:${c.planId}`, 'INFO', null],
    ]);
    const [budget, mercado, casa, deviation, dominant, ending] = october.insights;
    expect(budget).toMatchObject({
      ruleVersion: 1,
      thresholds: { warningBps: 8000, exceededBps: 10000 },
      budget: { categoryId: c.mercado, name: 'Mercado' },
      metrics: { state: 'WARNING', amountCents: 100_000, spentCents: 90_000, usedBps: 9000 },
    });
    expect(mercado).toMatchObject({
      thresholds: { ratioBps: 12_000, minDifferenceCents: 5_000 },
      category: { categoryId: c.mercado, name: 'Mercado' },
      metrics: {
        cents: 90_000,
        averageCents: 50_000,
        averageMonths: 3,
        differenceCents: 40_000,
        differenceBps: 8000,
      },
    });
    // TV: R$ 200 against the average of Jul–Sep (0, 0, 200) = R$ 66,66.
    expect(casa).toMatchObject({ metrics: { cents: 20_000, averageCents: 6_666 } });
    expect(deviation).toMatchObject({
      memberId: c.anaId,
      metrics: {
        paidShareBps: 8182,
        responsibleShareBps: 5000,
        deviationBps: 3182,
        differenceCents: 35_000,
      },
      evidence: {
        categories: [{ categoryId: c.mercado, name: 'Mercado', deltaCents: 45_000 }],
        transactions: [expect.objectContaining({ amountCents: 90_000, deltaCents: 45_000 })],
      },
    });
    expect(dominant).toMatchObject({
      metrics: { cents: 90_000, sharedSpendCents: 110_000, shareBps: 8182 },
    });
    expect(ending).toMatchObject({
      plan: { id: c.planId, description: 'TV' },
      metrics: { releaseMonth: '2026-12', releasedCents: 20_000 },
    });
  });

  it('evaluates a closed month: month-over-month change and new spending', async () => {
    const c = await seeded();
    const september = await view(c.bruno, `${c.insights}?month=2026-09`);
    expect(september.period).toBe('PAST');
    expect(september.insights.map((i) => i.fingerprint)).toEqual([
      // Leisure and the TV are new (average of Jul–Aug is 0).
      expect.stringMatching(/^CATEGORY_ABOVE_AVERAGE:2026-09:/),
      expect.stringMatching(/^CATEGORY_ABOVE_AVERAGE:2026-09:/),
      'MOM_CHANGE:2026-09:HOUSEHOLD:UP',
      `CONTRIBUTION_DEVIATION:2026-09:${c.brunoId}`,
      `DOMINANT_CATEGORY:2026-09:${c.mercado}`,
    ]);
    const change = september.insights.find((i) => i.ruleId === 'MOM_CHANGE');
    expect(change).toMatchObject({
      direction: 'UP',
      metrics: { cents: 100_000, previousCents: 50_000, changeCents: 50_000, changeBps: 10_000 },
    });
    // Future months have nothing to say yet.
    expect((await view(c.ana, `${c.insights}?month=2026-11`)).insights).toEqual([]);
  });

  it('dismisses per user, idempotently, and undoes (FR-INS-04)', async () => {
    const c = await seeded();
    const fingerprint = `BUDGET_NEAR_LIMIT:2026-10:${c.mercado}:WARNING`;
    await api(c.ana).post(`${c.insights}/dismissals`, { fingerprint }).expect(204);
    await api(c.ana).post(`${c.insights}/dismissals`, { fingerprint }).expect(204);

    const forAna = await view(c.ana, c.insights);
    expect(forAna.insights.find((i) => i.fingerprint === fingerprint)?.dismissedAt).toBe(
      NOW.toISOString(),
    );
    const forBruno = await view(c.bruno, c.insights);
    expect(forBruno.insights.find((i) => i.fingerprint === fingerprint)?.dismissedAt).toBeNull();

    await api(c.ana)
      .delete(`${c.insights}/dismissals/${encodeURIComponent(fingerprint)}`)
      .expect(204);
    const undone = await view(c.ana, c.insights);
    expect(undone.insights.every((i) => i.dismissedAt === null)).toBe(true);
  });

  it('validates input and isolates households', async () => {
    const c = await seeded();
    for (const fingerprint of ['', 'nope', 'BUDGET:2026-13x:abc', `X:2026-10:${'a'.repeat(41)}`]) {
      await api(c.ana).post(`${c.insights}/dismissals`, { fingerprint }).expect(400);
    }
    await api(c.ana).post(`${c.insights}/dismissals`, {}).expect(400);
    await api(c.ana).delete(`${c.insights}/dismissals/nope`).expect(400);
    await api(c.ana).get(`${c.insights}?month=2026-13`).expect(400);

    const stranger = await newUser('in-stranger');
    await api(stranger).get(c.insights).expect(404);
    await api(stranger)
      .post(`${c.insights}/dismissals`, { fingerprint: 'MOM_CHANGE:2026-10:HOUSEHOLD:UP' })
      .expect(404);
  });
});
