import type { DashboardView, InsightView, InsightsView } from '@couple-finance/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetSessionForTests } from '@/shared/auth/session';
import { sessionBody } from '@/test/fetch-mock';
import { renderApp } from '@/test/render-app';

const HID = '0199a0b0-0000-7000-8000-000000000001';
const ANA = '0199a0b0-0000-7000-8000-0000000000aa';
const BRUNO = '0199a0b0-0000-7000-8000-0000000000bb';
const MERCADO = '0199a0b0-0000-7000-8000-0000000000c1';
const TX = '0199a0b0-0000-7000-8000-0000000000d1';
const PLAN = '0199a0b0-0000-7000-8000-0000000000e1';
const API = `/api/v1/households/${HID}`;

const member = (id: string, displayName: string, isMe: boolean) => ({
  id,
  displayName,
  email: `${displayName.toLowerCase()}@example.com`,
  role: isMe ? 'OWNER' : 'MEMBER',
  status: 'ACTIVE',
  incomeVisibility: 'RATIO_ONLY',
  joinedAt: '2026-10-04T12:00:00.000Z',
  isMe,
});

const dashboard: DashboardView = {
  month: '2026-10',
  from: '2026-10-01',
  to: '2026-10-31',
  currency: 'BRL',
  hasAnyTransactions: true,
  totals: {
    sharedSpendCents: 110_000,
    individualSpendCents: 0,
    totalSpendCents: 110_000,
    transactionCount: 2,
  },
  members: [],
  categories: [],
  explanations: [],
  settlementSuggestion: null,
};

const BUDGET = `BUDGET_NEAR_LIMIT:2026-10:${MERCADO}:WARNING`;

const insights: InsightView[] = [
  {
    ruleId: 'BUDGET_NEAR_LIMIT',
    fingerprint: BUDGET,
    ruleVersion: 1,
    severity: 'ATTENTION',
    month: '2026-10',
    thresholds: { warningBps: 8000, exceededBps: 10000 },
    dismissedAt: null,
    budget: { categoryId: MERCADO, name: 'Mercado' },
    metrics: {
      state: 'WARNING',
      amountCents: 100_000,
      spentCents: 90_000,
      remainingCents: 10_000,
      usedBps: 9000,
    },
  },
  {
    ruleId: 'CATEGORY_ABOVE_AVERAGE',
    fingerprint: `CATEGORY_ABOVE_AVERAGE:2026-10:${MERCADO}`,
    ruleVersion: 1,
    severity: 'ATTENTION',
    month: '2026-10',
    thresholds: { ratioBps: 12_000, minDifferenceCents: 5_000 },
    dismissedAt: null,
    category: { categoryId: MERCADO, name: 'Mercado' },
    metrics: {
      cents: 90_000,
      averageCents: 50_000,
      averageMonths: 3,
      differenceCents: 40_000,
      differenceBps: 8000,
    },
  },
  {
    ruleId: 'CONTRIBUTION_DEVIATION',
    fingerprint: `CONTRIBUTION_DEVIATION:2026-10:${ANA}`,
    ruleVersion: 1,
    severity: 'INFO',
    month: '2026-10',
    thresholds: { minDeviationBps: 500 },
    dismissedAt: null,
    memberId: ANA,
    metrics: {
      paidShareBps: 8182,
      responsibleShareBps: 5000,
      deviationBps: 3182,
      differenceCents: 35_000,
    },
    evidence: {
      categories: [{ categoryId: MERCADO, name: 'Mercado', deltaCents: 45_000 }],
      transactions: [
        {
          transactionId: TX,
          description: 'Supermercado',
          date: '2026-10-05',
          categoryId: MERCADO,
          amountCents: 90_000,
          deltaCents: 45_000,
        },
      ],
    },
  },
  {
    ruleId: 'INSTALLMENT_ENDING',
    fingerprint: `INSTALLMENT_ENDING:2026-10:${PLAN}`,
    ruleVersion: 1,
    severity: 'INFO',
    month: '2026-10',
    thresholds: { withinMonths: 2 },
    dismissedAt: '2026-10-02T12:00:00.000Z',
    plan: { id: PLAN, description: 'TV' },
    metrics: { releaseMonth: '2026-12', releasedCents: 20_000 },
  },
];

const view = (items: InsightView[]): InsightsView => ({
  month: '2026-10',
  period: 'CURRENT',
  insights: items,
});

const routes = (bodies: InsightsView[]) => ({
  'POST /api/v1/auth/refresh': { status: 200, body: sessionBody('a', 'Ana') },
  [`GET ${API}`]: {
    status: 200,
    body: {
      id: HID,
      name: 'Casa da Ana',
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      defaultSplit: { type: 'EQUAL' },
      version: 1,
      createdAt: '2026-10-04T12:00:00.000Z',
      me: { memberId: ANA, role: 'OWNER' },
    },
  },
  [`GET ${API}/members`]: {
    status: 200,
    body: [member(ANA, 'Ana', true), member(BRUNO, 'Bruno', false)],
  },
  [`GET ${API}/dashboard`]: { status: 200, body: dashboard },
  [`GET ${API}/budgets?month=2026-10`]: {
    status: 200,
    body: { month: '2026-10', editable: true, data: [] },
  },
  [`GET ${API}/settlements?from=2026-10-01&to=2026-10-31`]: { status: 200, body: [] },
  [`GET ${API}/insights?month=2026-10`]: bodies.map((body) => ({ status: 200, body })),
});

describe('insights card', () => {
  beforeEach(() => {
    resetSessionForTests();
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('explains each insight in neutral words with evidence and the rule behind it', async () => {
    await renderApp(`/casas/${HID}`, routes([view(insights)]));
    const card = await screen.findByRole('region', { name: 'Destaques do mês' });
    const list = await within(card).findByRole('list', { name: 'Destaques' });
    const items = within(list)
      .getAllByRole('listitem')
      .filter((li) => li.parentElement === list);
    expect(items).toHaveLength(3);

    expect(items[0]).toHaveTextContent('Atenção');
    expect(items[0]).toHaveTextContent(
      /O orçamento de Mercado chegou a 90%: R\$\s900,00 de R\$\s1\.000,00, restam R\$\s100,00\./,
    );
    expect(
      within(items[0] as HTMLElement).getByRole('link', { name: 'Ver orçamentos' }),
    ).toHaveAttribute('href', `/casas/${HID}/orcamentos?mes=2026-10`);
    expect(items[1]).toHaveTextContent(
      /Mercado: R\$\s900,00 neste mês, 80% acima da média dos 3 meses anteriores \(R\$\s500,00\)\./,
    );
    expect(items[1]).toHaveTextContent(
      /passa de 120% da média dos meses anteriores \(até 3\) e a diferença é de pelo menos R\$\s50,00/,
    );
    expect(items[1]).toHaveTextContent('Regra CATEGORY_ABOVE_AVERAGE, versão 1.');

    const deviation = items[2] as HTMLElement;
    expect(deviation).toHaveTextContent('Para saber');
    expect(deviation).toHaveTextContent(
      /Ana pagou 81,82% das despesas compartilhadas, frente a 50% planejado \(R\$\s350,00 além da sua parte\)\./,
    );
    const evidence = within(deviation).getByRole('list', { name: 'Evidências' });
    expect(
      within(evidence).getByRole('link', { name: /Mercado \(\+R\$\s450,00\)/ }),
    ).toHaveAttribute('href', `/casas/${HID}/despesas?mes=2026-10&categoria=${MERCADO}`);
    expect(
      within(evidence).getByRole('link', { name: /Supermercado, R\$\s900,00 \(\+R\$\s450,00\)/ }),
    ).toHaveAttribute('href', `/casas/${HID}/despesas/${TX}`);
    // Neutral copy: no "deve" framing anywhere.
    expect(card.textContent).not.toMatch(/\bdeve\b/i);

    // The dismissed installment insight stays one click away.
    await userEvent.click(within(card).getByRole('button', { name: 'Mostrar dispensados (1)' }));
    const hidden = within(card).getByRole('list', { name: 'Destaques dispensados' });
    expect(hidden).toHaveTextContent(
      /A última parcela de TV é em novembro de 2026: a partir de dezembro de 2026, R\$\s200,00 por mês deixam de estar comprometidos\./,
    );
  });

  it('dismisses an insight for this user and undoes it', async () => {
    const dismissed = insights.map((i) =>
      i.fingerprint === BUDGET ? { ...i, dismissedAt: '2026-10-15T15:00:00.000Z' } : i,
    );
    const { mock } = await renderApp(`/casas/${HID}`, {
      ...routes([view(insights), view(dismissed), view(insights)]),
      [`POST ${API}/insights/dismissals`]: { status: 204 },
      [`DELETE ${API}/insights/dismissals/${encodeURIComponent(BUDGET)}`]: { status: 204 },
    });
    const card = await screen.findByRole('region', { name: 'Destaques do mês' });
    await userEvent.click(
      await within(card).findByRole('button', { name: /^Dispensar: O orçamento de Mercado/ }),
    );
    expect(mock.jsonBody(`POST ${API}/insights/dismissals`)).toEqual({ fingerprint: BUDGET });
    await vi.waitFor(() => {
      expect(within(card).queryByText(/O orçamento de Mercado chegou/)).not.toBeInTheDocument();
    });
    await userEvent.click(within(card).getByRole('button', { name: 'Desfazer' }));
    await vi.waitFor(() => {
      expect(mock.count(`DELETE ${API}/insights/dismissals/${encodeURIComponent(BUDGET)}`)).toBe(1);
    });
    expect(await within(card).findByText(/O orçamento de Mercado chegou/)).toBeInTheDocument();
  });

  it('says when nothing stands out', async () => {
    await renderApp(`/casas/${HID}`, routes([view([])]));
    const card = await screen.findByRole('region', { name: 'Destaques do mês' });
    expect(await within(card).findByText('Nada fora do comum neste mês.')).toBeInTheDocument();
  });
});
