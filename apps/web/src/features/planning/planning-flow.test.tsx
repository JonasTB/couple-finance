import type { GoalView, PurchasePlanView } from '@couple-finance/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetSessionForTests } from '@/shared/auth/session';
import { sessionBody } from '@/test/fetch-mock';
import { renderApp } from '@/test/render-app';

const HID = '0199a0b0-0000-7000-8000-000000000001';
const ANA = '0199a0b0-0000-7000-8000-0000000000aa';
const BRUNO = '0199a0b0-0000-7000-8000-0000000000bb';
const GOAL = '0199a0b0-0000-7000-8000-0000000000a1';
const PLAN = '0199a0b0-0000-7000-8000-0000000000b1';
const SOFA = '0199a0b0-0000-7000-8000-0000000000c1';
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

const goal: GoalView = {
  id: GOAL,
  name: 'Reserva',
  targetAmountCents: 1_200_000,
  targetDate: '2027-03-31',
  participantMemberIds: [ANA, BRUNO],
  status: 'ACTIVE',
  savedCents: 350_000,
  remainingCents: 850_000,
  progressBps: 2916,
  byMember: [
    { memberId: ANA, savedCents: 210_000 },
    { memberId: BRUNO, savedCents: 140_000 },
  ],
  forecast: {
    paceCents: 100_000,
    paceMonths: 3,
    monthsToGo: 9,
    forecastMonth: '2027-07',
    requiredMonthlyCents: 141_667,
    deadlinePassed: false,
  },
  version: 2,
  createdAt: '2026-07-01T12:00:00.000Z',
  archivedAt: null,
  entries: [
    {
      id: 'e1',
      memberId: BRUNO,
      type: 'CONTRIBUTION',
      amountCents: 100_000,
      date: '2026-09-10',
      notes: null,
      createdAt: '2026-09-10T12:00:00.000Z',
      deletedAt: null,
    },
  ],
};

const plan: PurchasePlanView = {
  id: PLAN,
  name: 'Casita',
  description: null,
  status: 'ACTIVE',
  totals: {
    estimatedCents: 770_000,
    futureCents: 900_000,
    actualCents: 379_900,
    remainingNeedCents: 370_000,
    varianceCents: -20_100,
    pendingCount: 2,
    purchasedCount: 1,
    futureCount: 1,
  },
  goal: { id: GOAL, name: 'Reserva', savedCents: 185_000, coverageBps: 5000 },
  version: 1,
  createdAt: '2026-10-01T12:00:00.000Z',
  archivedAt: null,
  items: [
    {
      id: SOFA,
      name: 'Sofá',
      estimatedPriceCents: 250_000,
      quantity: 1,
      estimatedTotalCents: 250_000,
      priority: 'HIGH',
      status: 'PENDING',
      paidPriceCents: null,
      purchasedAt: null,
      transaction: null,
      responsibleMemberId: BRUNO,
      url: null,
      notes: null,
      version: 1,
    },
    {
      id: 'i2',
      name: 'Geladeira',
      estimatedPriceCents: 400_000,
      quantity: 1,
      estimatedTotalCents: 400_000,
      priority: 'MEDIUM',
      status: 'PURCHASED',
      paidPriceCents: 379_900,
      purchasedAt: '2026-10-10',
      transaction: { id: TX, description: 'Geladeira', amountCents: 379_900, date: '2026-10-10' },
      responsibleMemberId: null,
      url: null,
      notes: null,
      version: 2,
    },
  ],
};

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
  [`GET ${API}/goals`]: { status: 200, body: [goal] },
  [`GET ${API}/goals/${GOAL}`]: { status: 200, body: goal },
  [`GET ${API}/purchase-plans`]: { status: 200, body: [plan] },
  [`GET ${API}/purchase-plans/${PLAN}`]: { status: 200, body: plan },
});

describe('goals and purchase plans', () => {
  beforeEach(() => {
    resetSessionForTests();
    localStorage.clear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T15:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('lists goals with their forecast and creates a goal', async () => {
    const { mock, router } = await renderApp(`/casas/${HID}/metas`, {
      ...routes(),
      [`POST ${API}/goals`]: { status: 201, body: goal },
    });
    const goals = await screen.findByRole('region', { name: 'Metas' });
    expect(
      await within(goals).findByRole('progressbar', { name: 'Reserva: 29,16%' }),
    ).toBeInTheDocument();
    expect(
      within(goals).getByText(
        /No ritmo atual \(R\$\s1\.000,00\/mês\), a meta é atingida em julho de 2027\./,
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Planos de compras' })).getByText(
        '1 de 3 itens comprados',
      ),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Nova meta' }));
    const form = screen.getByRole('form', { name: 'Nova meta' });
    await userEvent.type(within(form).getByLabelText('Nome da meta'), 'Viagem');
    await userEvent.type(within(form).getByLabelText('Valor da meta'), '8.000,00');
    await userEvent.click(within(form).getByLabelText('Bruno'));
    await userEvent.click(within(form).getByRole('button', { name: 'Criar meta' }));
    expect(mock.jsonBody(`POST ${API}/goals`)).toEqual({
      name: 'Viagem',
      targetAmountCents: 800_000,
      targetDate: null,
      participantMemberIds: [ANA],
    });
    await vi.waitFor(() => {
      expect(router.state.location.pathname).toBe(`/casas/${HID}/metas/${GOAL}`);
    });
  });

  it('shows the forecast and records a withdrawal on a goal', async () => {
    const { mock } = await renderApp(`/casas/${HID}/metas/${GOAL}`, {
      ...routes(),
      [`POST ${API}/goals/${GOAL}/entries`]: { status: 201, body: goal },
      [`DELETE ${API}/goals/${GOAL}/entries/e1`]: { status: 200, body: goal },
      [`POST ${API}/goals/${GOAL}/entries/e1/restore`]: { status: 200, body: goal },
    });
    expect(
      await screen.findByText(/Para chegar até 31 de março de 2027: R\$\s1\.416,67 por mês\./),
    ).toBeInTheDocument();
    expect(screen.getByText('Bruno guardou').nextSibling).toHaveTextContent('R$ 1.400,00');

    const form = screen.getByRole('form', { name: 'Registrar movimento' });
    await userEvent.selectOptions(within(form).getByLabelText('Tipo'), 'WITHDRAWAL');
    await userEvent.selectOptions(within(form).getByLabelText('Quem'), BRUNO);
    await userEvent.type(within(form).getByLabelText('Valor'), '200,00');
    await userEvent.click(within(form).getByRole('button', { name: 'Registrar' }));
    expect(mock.jsonBody(`POST ${API}/goals/${GOAL}/entries`)).toEqual({
      memberId: BRUNO,
      type: 'WITHDRAWAL',
      amountCents: 20_000,
      date: '2026-10-15',
    });

    await userEvent.click(
      screen.getByRole('button', { name: /Excluir movimento de R\$\s1\.000,00/ }),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Desfazer' }));
    expect(mock.count(`POST ${API}/goals/${GOAL}/entries/e1/restore`)).toBe(1);
  });

  it('shows plan totals, buys an item linking an expense, and adds items', async () => {
    const { mock } = await renderApp(`/casas/${HID}/metas/planos/${PLAN}`, {
      ...routes(),
      [`GET ${API}/transactions?from=2026-08-01&to=2026-10-15&limit=50`]: {
        status: 200,
        body: {
          data: [
            {
              id: TX,
              description: 'Sofá Loja X',
              amountCents: 239_900,
              date: '2026-10-12',
              categoryId: 'c',
              payerMemberId: ANA,
              paymentMethod: 'PIX',
              notes: null,
              tags: [],
              split: { type: 'EQUAL', weights: [] },
              allocations: [],
              origin: null,
              createdByMemberId: ANA,
              version: 1,
              createdAt: '2026-10-12T12:00:00.000Z',
              updatedAt: '2026-10-12T12:00:00.000Z',
              deletedAt: null,
            },
          ],
          page: { nextCursor: null, limit: 50 },
        },
      },
      [`POST ${API}/purchase-plans/${PLAN}/items/${SOFA}/purchase`]: { status: 200, body: plan },
      [`POST ${API}/purchase-plans/${PLAN}/items`]: { status: 201, body: plan },
    });

    expect(await screen.findByText('Falta comprar')).toBeInTheDocument();
    expect(screen.getByText('Falta comprar').nextSibling).toHaveTextContent('R$ 3.700,00');
    expect(screen.getByText(/R\$\s201,00 abaixo/)).toBeInTheDocument();
    expect(screen.getByText(/cobrem 50% do que falta comprar/)).toBeInTheDocument();
    const bought = screen.getByRole('region', { name: 'Comprados' });
    expect(within(bought).getByText(/despesa: Geladeira/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Comprar Sofá' }));
    const form = screen.getByRole('form', { name: 'Comprar Sofá' });
    const paid = within(form).getByLabelText('Valor pago (total)');
    await userEvent.clear(paid);
    await userEvent.type(paid, '2.399,00');
    await userEvent.selectOptions(within(form).getByLabelText('Despesa registrada (opcional)'), TX);
    await userEvent.click(within(form).getByRole('button', { name: 'Marcar como comprado' }));
    expect(mock.jsonBody(`POST ${API}/purchase-plans/${PLAN}/items/${SOFA}/purchase`)).toEqual({
      paidPriceCents: 239_900,
      purchasedAt: '2026-10-15',
      transactionId: TX,
    });

    const add = screen.getByRole('form', { name: 'Adicionar item' });
    await userEvent.type(within(add).getByLabelText('Item'), 'Cadeira');
    await userEvent.type(within(add).getByLabelText('Preço estimado (unidade)'), '300,00');
    await userEvent.clear(within(add).getByLabelText('Quantidade'));
    await userEvent.type(within(add).getByLabelText('Quantidade'), '4');
    await userEvent.click(within(add).getByRole('button', { name: 'Adicionar item' }));
    expect(mock.jsonBody(`POST ${API}/purchase-plans/${PLAN}/items`)).toEqual({
      name: 'Cadeira',
      estimatedPriceCents: 30_000,
      quantity: 4,
      priority: 'MEDIUM',
      status: 'PENDING',
      responsibleMemberId: null,
    });
  });
});
