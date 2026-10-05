import type { AnalyticsMonth, AnalyticsView } from '@couple-finance/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetSessionForTests } from '@/shared/auth/session';
import { sessionBody } from '@/test/fetch-mock';
import { renderApp } from '@/test/render-app';

const HID = '0199a0b0-0000-7000-8000-000000000001';
const ANA = '0199a0b0-0000-7000-8000-0000000000aa';
const BRUNO = '0199a0b0-0000-7000-8000-0000000000bb';
const MERCADO = '0199a0b0-0000-7000-8000-0000000000c1';
const CASA = '0199a0b0-0000-7000-8000-0000000000c2';
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

const month = (
  m: string,
  period: AnalyticsMonth['period'],
  shared: number,
  recurring: number,
  installment: number,
  income: AnalyticsMonth['income'],
  shares: [number, number] | null,
): AnalyticsMonth => ({
  month: m,
  period,
  sharedSpendCents: shared,
  individualSpendCents: 0,
  recurringCents: recurring,
  installmentCents: installment,
  otherCents: shared - recurring - installment,
  fixedCents: recurring + installment,
  changeCents: null,
  changeBps: null,
  members: [ANA, BRUNO].map((memberId, i) => ({
    memberId,
    paidSharedCents: 0,
    responsibleSharedCents: 0,
    paidShareBps: shares ? (shares[i] ?? null) : null,
    responsibleShareBps: shares ? 5000 : null,
    deviationBps: shares ? (shares[i] ?? 0) - 5000 : null,
  })),
  income,
});

const noIncome = { complete: false, incomeCents: null, fixedBps: null, spendBps: null };

const view = (months: number): AnalyticsView => ({
  from: '2026-08',
  to: '2026-10',
  currency: 'BRL',
  hasAnyTransactions: true,
  incomeVisible: false,
  members: [
    { memberId: ANA, status: 'ACTIVE' },
    { memberId: BRUNO, status: 'ACTIVE' },
  ],
  months: [
    month('2026-08', 'PAST', 62_000, 12_000, 0, noIncome, [1935, 8065]),
    month(
      '2026-09',
      'PAST',
      112_000,
      12_000,
      30_000,
      { complete: true, incomeCents: null, fixedBps: 420, spendBps: 1120 },
      [7321, 2679],
    ),
    month(
      '2026-10',
      'CURRENT',
      82_000,
      12_000,
      30_000,
      { complete: true, incomeCents: null, fixedBps: 420, spendBps: 820 },
      [1463, 8537],
    ),
  ].slice(-months),
  averages: {
    months: 2,
    sharedSpendCents: 87_000,
    fixedCents: 27_000,
    installmentCents: 15_000,
    otherCents: 60_000,
  },
  comparison: {
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
    categories: [
      {
        categoryId: MERCADO,
        name: 'Mercado',
        cents: 40_000,
        previousCents: 70_000,
        averageCents: 60_000,
        vsAverageCents: -20_000,
        vsAverageBps: -3333,
      },
      {
        categoryId: CASA,
        name: 'Casa e decoração',
        cents: 30_000,
        previousCents: 30_000,
        averageCents: 15_000,
        vsAverageCents: 15_000,
        vsAverageBps: 10_000,
      },
    ],
  },
  categories: [
    {
      categoryId: MERCADO,
      name: 'Mercado',
      totalCents: 160_000,
      shareBps: 7273,
      monthlyCents: [50_000, 70_000, 40_000],
    },
    {
      categoryId: CASA,
      name: 'Casa e decoração',
      totalCents: 60_000,
      shareBps: 2727,
      monthlyCents: [0, 30_000, 30_000],
    },
  ],
  goals: [
    {
      goalId: 'g1',
      name: 'Reserva',
      targetAmountCents: 500_000,
      status: 'ACTIVE',
      savedCents: [100_000, 150_000, 150_000],
    },
  ],
});

const routes = () => ({
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
  [`GET ${API}/analytics?months=12`]: { status: 200, body: view(3) },
});

describe('analytics page', () => {
  beforeEach(() => {
    resetSessionForTests();
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('explains the month, income commitment, shares, categories and goals', async () => {
    await renderApp(`/casas/${HID}/analises`, routes());

    const summary = await screen.findByRole('region', { name: 'Resumo do mês' });
    expect(within(summary).getByText('R$ 820,00')).toBeInTheDocument();
    expect(
      within(summary).getByText(/R\$\s300,00 a menos que setembro \(−26,78%\)\./),
    ).toBeInTheDocument();
    expect(
      within(summary).getByText(
        /R\$\s50,00 abaixo da média dos 2 meses anteriores \(R\$\s870,00, −5,74%\)\./,
      ),
    ).toBeInTheDocument();
    expect(within(summary).getByText(/Mês em andamento/)).toBeInTheDocument();

    const income = screen.getByRole('region', { name: 'Renda comprometida' });
    expect(income).toHaveTextContent(
      'Em outubro de 2026, os fixos usaram 4,2% da renda da casa e o gasto compartilhado, 8,2%.',
    );
    expect(within(income).getByText(/só a proporção/)).toBeInTheDocument();
    // The same numbers as an accessible table; no income amount column while hidden.
    const incomeTable = within(income).getByRole('table');
    expect(within(incomeTable).queryByText('Renda da casa')).not.toBeInTheDocument();
    expect(
      within(incomeTable).getByRole('row', { name: /Agosto de 2026 — —/ }),
    ).toBeInTheDocument();

    const trend = screen.getByRole('region', { name: 'Gasto por mês' });
    expect(
      within(trend).getByRole('row', {
        name: /Setembro de 2026 R\$\s120,00 R\$\s300,00 R\$\s700,00 R\$\s1\.120,00/,
      }),
    ).toBeInTheDocument();

    const shares = screen.getByRole('region', { name: 'Quem pagou, mês a mês' });
    expect(
      within(shares).getByRole('img', {
        name: 'Outubro de 2026: Ana pagou 14,63% (planejado 50%); Bruno pagou 85,37% (planejado 50%)',
      }),
    ).toBeInTheDocument();

    const categories = screen.getByRole('region', { name: 'Categorias' });
    const mercado = within(categories).getByRole('link', { name: /Mercado/ });
    expect(mercado).toHaveTextContent(/R\$\s400,00média R\$\s600,00 · −33,33%/);
    expect(mercado).toHaveAttribute(
      'href',
      `/casas/${HID}/despesas?mes=2026-10&categoria=${MERCADO}`,
    );
    await userEvent.selectOptions(within(categories).getByLabelText('Categoria'), CASA);
    expect(within(categories).getByText(/R\$\s600,00 no período, 27,27%/)).toBeInTheDocument();

    const goals = screen.getByRole('region', { name: 'Evolução das metas' });
    expect(within(goals).getByRole('link', { name: 'Reserva' })).toHaveAttribute(
      'href',
      `/casas/${HID}/metas/g1`,
    );
    expect(within(goals).getByText(/R\$\s1\.500,00 de R\$\s5\.000,00/)).toBeInTheDocument();
  });

  it('changes the period and the last month through the URL', async () => {
    const { mock, router } = await renderApp(`/casas/${HID}/analises`, {
      ...routes(),
      [`GET ${API}/analytics?months=24`]: { status: 200, body: view(3) },
      [`GET ${API}/analytics?months=24&month=2026-09`]: { status: 200, body: view(2) },
    });
    await screen.findByRole('region', { name: 'Resumo do mês' });
    expect(screen.getByRole('button', { name: '12 meses' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await userEvent.click(screen.getByRole('button', { name: '24 meses' }));
    await vi.waitFor(() => {
      expect(mock.count(`GET ${API}/analytics?months=24`)).toBe(1);
    });
    await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }));
    await vi.waitFor(() => {
      expect(mock.count(`GET ${API}/analytics?months=24&month=2026-09`)).toBe(1);
    });
    expect(router.state.location.search).toBe('?periodo=24&mes=2026-09');
  });

  it('guides to the first expense when there is nothing to analyse', async () => {
    const empty = { ...view(3), hasAnyTransactions: false, goals: [] };
    await renderApp(`/casas/${HID}/analises`, {
      ...routes(),
      [`GET ${API}/analytics?months=12`]: { status: 200, body: empty },
    });
    expect(await screen.findByText(/aparecem depois da primeira despesa/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Registrar despesa' })).toHaveAttribute(
      'href',
      `/casas/${HID}/despesas/nova`,
    );
    expect(screen.getByText(/Nenhuma meta ativa/)).toBeInTheDocument();
  });
});
