import type { DashboardView } from '@couple-finance/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetSessionForTests } from '@/shared/auth/session';
import { sessionBody } from '@/test/fetch-mock';
import { renderApp } from '@/test/render-app';

const HID = '0199a0b0-0000-7000-8000-000000000001';
const ANA = '0199a0b0-0000-7000-8000-0000000000aa';
const BRUNO = '0199a0b0-0000-7000-8000-0000000000bb';
const MORADIA = '0199a0b0-0000-7000-8000-0000000000c1';
const MERCADO = '0199a0b0-0000-7000-8000-0000000000c2';
const TX = '0199a0b0-0000-7000-8000-0000000000d1';
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

const emptyDashboard: DashboardView = {
  month: '2026-10',
  from: '2026-10-01',
  to: '2026-10-31',
  currency: 'BRL',
  hasAnyTransactions: false,
  totals: { sharedSpendCents: 0, individualSpendCents: 0, totalSpendCents: 0, transactionCount: 0 },
  members: [],
  categories: [],
  explanations: [],
  settlementSuggestion: null,
};

const october: DashboardView = {
  ...emptyDashboard,
  hasAnyTransactions: true,
  totals: {
    sharedSpendCents: 198000,
    individualSpendCents: 40000,
    totalSpendCents: 238000,
    transactionCount: 5,
  },
  members: [
    {
      memberId: ANA,
      status: 'ACTIVE',
      paidCents: 188000,
      paidSharedCents: 178000,
      responsibleSharedCents: 99000,
      paidShareBps: 8990,
      responsibleShareBps: 5000,
      deviationBps: 3990,
      sharedDifferenceCents: 79000,
      periodBalanceCents: 89000,
      cumulativeBalanceCents: 85500,
    },
    {
      memberId: BRUNO,
      status: 'ACTIVE',
      paidCents: 50000,
      paidSharedCents: 20000,
      responsibleSharedCents: 99000,
      paidShareBps: 1010,
      responsibleShareBps: 5000,
      deviationBps: -3990,
      sharedDifferenceCents: -79000,
      periodBalanceCents: -89000,
      cumulativeBalanceCents: -85500,
    },
  ],
  categories: [
    {
      categoryId: MORADIA,
      name: 'Moradia',
      sharedSpendCents: 120000,
      shareBps: 6061,
      transactionCount: 1,
    },
    {
      categoryId: MERCADO,
      name: 'Mercado',
      sharedSpendCents: 78000,
      shareBps: 3939,
      transactionCount: 2,
    },
  ],
  explanations: [
    {
      memberId: ANA,
      direction: 'ABOVE',
      categories: [
        { categoryId: MORADIA, name: 'Moradia', deltaCents: 60000 },
        { categoryId: MERCADO, name: 'Mercado', deltaCents: 29000 },
      ],
      transactions: [
        {
          transactionId: TX,
          description: 'Condomínio',
          date: '2026-10-10',
          categoryId: MORADIA,
          amountCents: 120000,
          deltaCents: 60000,
        },
      ],
    },
    {
      memberId: BRUNO,
      direction: 'BELOW',
      categories: [{ categoryId: MORADIA, name: 'Moradia', deltaCents: -60000 }],
      transactions: [],
    },
  ],
  settlementSuggestion: { fromMemberId: BRUNO, toMemberId: ANA, amountCents: 85500 },
};

const settlement = {
  id: 's1',
  fromMemberId: BRUNO,
  toMemberId: ANA,
  amountCents: 85500,
  date: '2026-10-04',
  notes: null,
  createdByMemberId: ANA,
  createdAt: '2026-10-04T12:00:00.000Z',
  deletedAt: null,
};

const routes = (members: object[], dashboard: DashboardView | DashboardView[]) => ({
  'POST /api/v1/auth/refresh': { status: 200, body: sessionBody('a', 'Ana') },
  [`GET ${API}/budgets?month=2026-10`]: {
    status: 200,
    body: { month: '2026-10', editable: true, data: [] },
  },
  [`GET ${API}/budgets?month=2026-09`]: {
    status: 200,
    body: { month: '2026-09', editable: false, data: [] },
  },
  [`GET ${API}/insights?month=2026-10`]: {
    status: 200,
    body: { month: '2026-10', period: 'CURRENT', insights: [] },
  },
  [`GET ${API}/insights?month=2026-09`]: {
    status: 200,
    body: { month: '2026-09', period: 'PAST', insights: [] },
  },
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
  [`GET ${API}/members`]: { status: 200, body: members },
  [`GET ${API}/dashboard`]: Array.isArray(dashboard)
    ? dashboard.map((body) => ({ status: 200, body }))
    : { status: 200, body: dashboard },
});

describe('dashboard', () => {
  beforeEach(() => {
    resetSessionForTests();
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('guides a new household to invite and record the first expense', async () => {
    await renderApp(`/casas/${HID}`, routes([member(ANA, 'Ana', true)], emptyDashboard));

    const steps = await screen.findByRole('list', { name: 'Passos' });
    expect(within(steps).getByText('Criar a casa')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Convidar' })).toHaveAttribute(
      'href',
      `/casas/${HID}/casa`,
    );
    expect(screen.getByRole('link', { name: 'Registrar' })).toHaveAttribute(
      'href',
      `/casas/${HID}/despesas/nova`,
    );
    expect(screen.queryByText('Gasto compartilhado')).not.toBeInTheDocument();
    expect(localStorage.getItem('cf:activeHouseholdId')).toBe(HID);
  });

  it('shows totals, shares, the explanation and balances computed by the API', async () => {
    await renderApp(`/casas/${HID}`, {
      ...routes([member(ANA, 'Ana', true), member(BRUNO, 'Bruno', false)], october),
      [`GET ${API}/settlements?from=2026-10-01&to=2026-10-31`]: { status: 200, body: [] },
    });

    expect(await screen.findByRole('heading', { name: 'Outubro de 2026' })).toBeInTheDocument();
    expect(screen.queryByText('Primeiros passos')).not.toBeInTheDocument();
    expect(screen.getByText('Gasto compartilhado').nextSibling).toHaveTextContent('R$ 1.980,00');
    expect(screen.getByText('Total (5 despesas)')).toBeInTheDocument();

    const shares = screen.getByRole('list', { name: 'Participação de cada pessoa' });
    expect(within(shares).getByRole('img', { name: 'Ana pagou 89,9%; parte planejada 50%' }));
    expect(within(shares).getByText(/39,9 p\.p\. acima/)).toBeInTheDocument();
    expect(within(shares).getByText(/39,9 p\.p\. abaixo/)).toBeInTheDocument();

    expect(
      screen.getByText(/Ana pagou 89,9% das despesas compartilhadas, frente a 50% planejado/),
    ).toHaveTextContent('A diferença de R$ 790,00 veio principalmente de:');
    const reasons = screen.getByRole('list', { name: 'Categorias que explicam a diferença' });
    expect(within(reasons).getByText('+R$ 600,00')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Condomínio/ })).toHaveAttribute(
      'href',
      `/casas/${HID}/despesas/${TX}`,
    );

    const categories = screen.getByRole('list', { name: 'Categorias' });
    expect(within(categories).getByRole('link', { name: /Moradia/ })).toHaveAttribute(
      'href',
      `/casas/${HID}/despesas?mes=2026-10&categoria=${MORADIA}`,
    );

    expect(screen.getByText('Neste mês: R$ 890,00 além da sua parte')).toBeInTheDocument();
    expect(screen.getByText('Neste mês: R$ 890,00 abaixo da sua parte')).toBeInTheDocument();
    expect(screen.getByText(/Bruno pode transferir/)).toHaveTextContent(
      'Para equilibrar o acumulado, Bruno pode transferir R$ 855,00 para Ana.',
    );
    // Neutral language: no "dívida"/"deve".
    expect(document.body.textContent).not.toMatch(/dívida|deve /i);
  });

  it('records the suggested settlement, then deletes it with undo', async () => {
    const { mock } = await renderApp(`/casas/${HID}`, {
      ...routes([member(ANA, 'Ana', true), member(BRUNO, 'Bruno', false)], october),
      [`GET ${API}/settlements?from=2026-10-01&to=2026-10-31`]: [
        { status: 200, body: [] },
        { status: 200, body: [settlement] },
      ],
      [`POST ${API}/settlements`]: { status: 201, body: settlement },
      [`DELETE ${API}/settlements/s1`]: { status: 204 },
      [`POST ${API}/settlements/s1/restore`]: { status: 200, body: settlement },
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Registrar acerto' }));
    const form = screen.getByRole('form', { name: 'Registrar acerto' });
    expect(within(form).getByLabelText('Quem transferiu')).toHaveValue(BRUNO);
    expect(within(form).getByLabelText('Quem recebeu')).toHaveValue(ANA);
    expect(within(form).getByLabelText('Valor')).toHaveValue('855,00');
    await userEvent.type(within(form).getByLabelText('Observação (opcional)'), 'Pix');
    await userEvent.click(within(form).getByRole('button', { name: 'Salvar acerto' }));

    expect(await screen.findByText(/Bruno → Ana/)).toBeInTheDocument();
    expect(mock.jsonBody(`POST ${API}/settlements`)).toMatchObject({
      fromMemberId: BRUNO,
      toMemberId: ANA,
      amountCents: 85500,
      notes: 'Pix',
    });

    await userEvent.click(screen.getByRole('button', { name: /Excluir acerto de R\$\s855,00/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Desfazer' }));
    expect(mock.count(`POST ${API}/settlements/s1/restore`)).toBe(1);
  });

  it('rejects a settlement between the same person before calling the API', async () => {
    const { mock } = await renderApp(`/casas/${HID}`, {
      ...routes([member(ANA, 'Ana', true), member(BRUNO, 'Bruno', false)], october),
      [`GET ${API}/settlements?from=2026-10-01&to=2026-10-31`]: { status: 200, body: [] },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Novo acerto' }));
    const form = screen.getByRole('form', { name: 'Registrar acerto' });
    await userEvent.selectOptions(within(form).getByLabelText('Quem recebeu'), ANA);
    await userEvent.type(within(form).getByLabelText('Valor'), '10');
    await userEvent.click(within(form).getByRole('button', { name: 'Salvar acerto' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Escolha pessoas diferentes');
    expect(mock.count(`POST ${API}/settlements`)).toBe(0);
  });

  it('surfaces the total budget and the budgets needing attention', async () => {
    const budget = (id: string, name: string | null, state: string, usedBps: number) => ({
      id,
      categoryId: name ? id : null,
      categoryName: name,
      categoryArchived: false,
      amountCents: 100000,
      spentCents: usedBps * 10,
      remainingCents: 100000 - usedBps * 10,
      usedBps,
      state,
      fromMonth: '2026-10',
      toMonth: null,
      next: null,
    });
    await renderApp(`/casas/${HID}`, {
      ...routes([member(ANA, 'Ana', true), member(BRUNO, 'Bruno', false)], october),
      [`GET ${API}/settlements?from=2026-10-01&to=2026-10-31`]: { status: 200, body: [] },
      [`GET ${API}/budgets?month=2026-10`]: {
        status: 200,
        body: {
          month: '2026-10',
          editable: true,
          data: [
            budget('t', null, 'OK', 5000),
            budget('a', 'Lazer', 'OK', 1000),
            budget('b', 'Mercado', 'EXCEEDED', 11600),
          ],
        },
      },
    });
    const card = await screen.findByRole('region', { name: 'Orçamentos' });
    expect(within(card).getByText('1 orçamento pede atenção.')).toBeInTheDocument();
    expect(
      within(card)
        .getAllByRole('meter')
        .map((m) => m.getAttribute('aria-label')),
    ).toEqual(['Total da casa: 50% usado', 'Mercado: 116% usado']);
    expect(within(card).getByRole('link', { name: 'Ver todos os orçamentos' })).toHaveAttribute(
      'href',
      `/casas/${HID}/orcamentos?mes=2026-10`,
    );
  });

  it('navigates to another month', async () => {
    const { mock } = await renderApp(`/casas/${HID}`, {
      ...routes([member(ANA, 'Ana', true), member(BRUNO, 'Bruno', false)], october),
      [`GET ${API}/settlements?from=2026-10-01&to=2026-10-31`]: { status: 200, body: [] },
      [`GET ${API}/dashboard?month=2026-09`]: {
        status: 200,
        body: { ...october, month: '2026-09', from: '2026-09-01', to: '2026-09-30' },
      },
      [`GET ${API}/settlements?from=2026-09-01&to=2026-09-30`]: { status: 200, body: [] },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Mês anterior' }));
    expect(await screen.findByRole('heading', { name: 'Setembro de 2026' })).toBeInTheDocument();
    expect(mock.count(`GET ${API}/dashboard?month=2026-09`)).toBe(1);
  });
});
