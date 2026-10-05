import type {
  InstallmentPlanView,
  InstallmentSummary,
  OccurrenceView,
  RecurringExpenseView,
} from '@couple-finance/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetSessionForTests } from '@/shared/auth/session';
import { sessionBody } from '@/test/fetch-mock';
import { renderApp } from '@/test/render-app';

const HID = '0199a0b0-0000-7000-8000-000000000001';
const ANA = '0199a0b0-0000-7000-8000-0000000000aa';
const BRUNO = '0199a0b0-0000-7000-8000-0000000000bb';
const REC = '0199a0b0-0000-7000-8000-0000000000e1';
const PLAN = '0199a0b0-0000-7000-8000-0000000000f1';
const CAT = '0199a0b0-0000-7000-8000-0000000000c1';
const API = `/api/v1/households/${HID}`;
// Today is 15 Oct 2026 in São Paulo: overdue lookup from Oct 2025, upcoming until Nov 2026.
const OCCURRENCES = `${API}/recurring-expenses/occurrences?from=2025-10-01&to=2026-11-30`;

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

const recurring: RecurringExpenseView = {
  id: REC,
  description: 'Internet',
  categoryId: CAT,
  expectedAmountCents: 12000,
  amountType: 'VARIABLE',
  frequency: 'MONTHLY',
  interval: 1,
  startDate: '2026-08-10',
  endDate: null,
  payerMemberId: BRUNO,
  paymentMethod: 'BOLETO',
  split: null,
  notes: null,
  status: 'ACTIVE',
  pauses: [],
  scheduleLocked: true,
  nextOccurrenceDate: '2026-11-10',
  version: 3,
  createdAt: '2026-08-01T12:00:00.000Z',
  deletedAt: null,
};

const occurrence = (date: string, status: OccurrenceView['status']): OccurrenceView => ({
  recurringExpenseId: REC,
  occurrenceDate: date,
  status,
  description: 'Internet',
  categoryId: CAT,
  expectedAmountCents: 12000,
  amountType: 'VARIABLE',
  transactionId: null,
  amountCents: null,
});

const plan: InstallmentPlanView = {
  id: PLAN,
  description: 'Geladeira',
  categoryId: CAT,
  payerMemberId: ANA,
  paymentMethod: 'CREDIT_CARD',
  installmentCount: 10,
  firstInstallmentDate: '2026-03-15',
  originalTotalCents: 420000,
  totalCents: 420000,
  paidCount: 8,
  paidCents: 336000,
  remainingCount: 2,
  remainingCents: 84000,
  installmentAmountCents: 42000,
  nextInstallment: { number: 9, date: '2026-11-15', amountCents: 42000 },
  releaseMonth: '2027-01',
  status: 'ACTIVE',
  split: { type: 'EQUAL', weights: [] },
  notes: null,
  closedAt: null,
  createdAt: '2026-03-01T12:00:00.000Z',
  deletedAt: null,
  installments: [9, 10].map((number) => ({
    number,
    transactionId: `0199a0b0-0000-7000-8000-0000000001${String(number).padStart(2, '0')}`,
    date: number === 9 ? '2026-11-15' : '2026-12-15',
    amountCents: 42000,
    status: 'REMAINING' as const,
    payoff: false,
  })),
};

const summary: InstallmentSummary = {
  months: Array.from({ length: 12 }, (_, i) => ({
    month: `${String(2026 + Math.floor((9 + i) / 12))}-${String(((9 + i) % 12) + 1).padStart(2, '0')}`,
    installmentsCents: i < 3 ? 42000 : 0,
    activePlans: i < 3 ? 1 : 0,
  })),
  releases: [
    {
      month: '2027-01',
      releasedCents: 42000,
      plans: [{ id: PLAN, description: 'Geladeira', installmentAmountCents: 42000 }],
    },
  ],
};

const baseRoutes = () => ({
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
  [`GET ${API}/categories`]: {
    status: 200,
    body: [
      { id: CAT, name: 'Moradia', parentId: null, isSystem: true, archived: false, children: [] },
    ],
  },
  [`GET ${OCCURRENCES}`]: {
    status: 200,
    body: [occurrence('2026-09-10', 'OVERDUE'), occurrence('2026-11-10', 'UPCOMING')],
  },
  [`GET ${API}/recurring-expenses`]: { status: 200, body: [recurring] },
  [`GET ${API}/installment-plans`]: { status: 200, body: [plan] },
  [`GET ${API}/installment-plans/summary`]: { status: 200, body: summary },
});

describe('commitments', () => {
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

  it('lists pending and upcoming occurrences, recurring expenses and installment plans', async () => {
    await renderApp(`/casas/${HID}/compromissos`, baseRoutes());

    const pending = await screen.findByRole('region', { name: /Pendentes \(1\)/ });
    expect(within(pending).getByText('Internet')).toBeInTheDocument();
    expect(
      within(pending).getByText(/10 de setembro de 2026 · cerca de R\$\s120,00/),
    ).toBeInTheDocument();

    const recurringList = screen.getByRole('region', { name: 'Despesas recorrentes' });
    expect(within(recurringList).getByText('Todo mês, dia 10')).toBeInTheDocument();

    const plans = screen.getByRole('region', { name: 'Compras parceladas' });
    expect(within(plans).getByRole('img', { name: '8 de 10 parcelas pagas' })).toBeInTheDocument();
    expect(within(plans).getByText(/falta R\$\s840,00/)).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Liberações' })).getByText(/liberados em/),
    ).toHaveTextContent('R$ 420,00/mês liberados em janeiro de 2027 (Geladeira)');
  });

  it('records an occurrence with the actual amount, or skips it', async () => {
    const { mock } = await renderApp(`/casas/${HID}/compromissos`, {
      ...baseRoutes(),
      [`POST ${API}/recurring-expenses/${REC}/occurrences/2026-09-10/confirm`]: {
        status: 201,
        body: { transactionId: 'tx' },
      },
      [`POST ${API}/recurring-expenses/${REC}/occurrences/2026-11-10/skip`]: { status: 204 },
    });

    await userEvent.click(
      await screen.findByRole('button', { name: 'Registrar Internet de 10 de set.' }),
    );
    const form = screen.getByRole('form', { name: 'Registrar Internet' });
    expect(within(form).getByLabelText('Quem pagou')).toHaveValue(BRUNO);
    const amount = within(form).getByLabelText('Valor pago');
    await userEvent.clear(amount);
    await userEvent.type(amount, '131,90');
    await userEvent.click(within(form).getByRole('button', { name: 'Confirmar despesa' }));
    expect(
      mock.jsonBody(`POST ${API}/recurring-expenses/${REC}/occurrences/2026-09-10/confirm`),
    ).toEqual({ amountCents: 13190, date: '2026-09-10', payerMemberId: BRUNO });

    await userEvent.click(screen.getByRole('button', { name: 'Pular Internet de 10 de nov.' }));
    expect(mock.count(`POST ${API}/recurring-expenses/${REC}/occurrences/2026-11-10/skip`)).toBe(1);
  });

  it('creates a recurring expense', async () => {
    const { mock, router } = await renderApp(`/casas/${HID}/compromissos/recorrentes/nova`, {
      ...baseRoutes(),
      [`POST ${API}/recurring-expenses`]: { status: 201, body: recurring },
    });
    await userEvent.type(await screen.findByLabelText('Descrição'), 'Academia');
    await userEvent.type(screen.getByLabelText('Valor esperado'), '99,90');
    await userEvent.selectOptions(screen.getByLabelText('Categoria'), CAT);
    await userEvent.clear(screen.getByLabelText('Primeiro vencimento'));
    await userEvent.type(screen.getByLabelText('Primeiro vencimento'), '2026-11-05');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(mock.jsonBody(`POST ${API}/recurring-expenses`)).toEqual({
      description: 'Academia',
      expectedAmountCents: 9990,
      amountType: 'FIXED',
      frequency: 'MONTHLY',
      interval: 1,
      startDate: '2026-11-05',
      endDate: null,
      categoryId: CAT,
      payerMemberId: ANA,
      paymentMethod: 'BOLETO',
      notes: null,
      split: null,
    });
    await vi.waitFor(() => {
      expect(router.state.location.pathname).toBe(`/casas/${HID}/compromissos`);
    });
  });

  it('locks the schedule of a recurring expense with history and pauses it', async () => {
    const { mock } = await renderApp(`/casas/${HID}/compromissos/recorrentes/${REC}`, {
      ...baseRoutes(),
      [`GET ${API}/recurring-expenses/${REC}`]: { status: 200, body: recurring },
      [`POST ${API}/recurring-expenses/${REC}/pause`]: {
        status: 200,
        body: { ...recurring, status: 'PAUSED' },
      },
    });
    expect(await screen.findByLabelText('Frequência')).toBeDisabled();
    expect(screen.getByText(/encerre esta e crie\s+outra/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pausar' }));
    expect(mock.count(`POST ${API}/recurring-expenses/${REC}/pause`)).toBe(1);
  });

  it('creates an installment purchase from the total', async () => {
    const { mock, router } = await renderApp(`/casas/${HID}/compromissos/parcelados/novo`, {
      ...baseRoutes(),
      [`POST ${API}/installment-plans`]: { status: 201, body: plan },
      [`GET ${API}/installment-plans/${PLAN}`]: { status: 200, body: plan },
    });
    await userEvent.type(await screen.findByLabelText('Descrição'), 'Geladeira');
    await userEvent.type(screen.getByLabelText('Valor total'), '4.200,00');
    await userEvent.selectOptions(screen.getByLabelText('Categoria'), CAT);
    await userEvent.click(screen.getByRole('button', { name: 'Criar compra parcelada' }));

    expect(mock.jsonBody(`POST ${API}/installment-plans`)).toEqual({
      description: 'Geladeira',
      totalAmountCents: 420000,
      installmentCount: 10,
      firstInstallmentDate: '2026-10-15',
      categoryId: CAT,
      payerMemberId: ANA,
      paymentMethod: 'CREDIT_CARD',
    });
    await vi.waitFor(() => {
      expect(router.state.location.pathname).toBe(`/casas/${HID}/compromissos/parcelados/${PLAN}`);
    });
  });

  it('pays a plan off early and deletes it with undo', async () => {
    const { mock } = await renderApp(`/casas/${HID}/compromissos/parcelados/${PLAN}`, {
      ...baseRoutes(),
      [`GET ${API}/installment-plans/${PLAN}`]: { status: 200, body: plan },
      [`POST ${API}/installment-plans/${PLAN}/close`]: {
        status: 200,
        body: { ...plan, status: 'PAID_OFF' },
      },
      [`DELETE ${API}/installment-plans/${PLAN}`]: { status: 204 },
      [`POST ${API}/installment-plans/${PLAN}/restore`]: { status: 200, body: plan },
    });

    expect(await screen.findByText('Parcela 9/10')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Quitar antecipadamente' }));
    const form = screen.getByRole('form', { name: 'Encerrar compra parcelada' });
    await userEvent.type(within(form).getByLabelText('Valor pago'), '800,00');
    await userEvent.click(within(form).getByRole('button', { name: 'Confirmar' }));
    expect(mock.jsonBody(`POST ${API}/installment-plans/${PLAN}/close`)).toEqual({
      kind: 'PAY_OFF',
      date: '2026-10-15',
      payoffAmountCents: 80000,
    });

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Excluir compra' }));
    expect(await screen.findByText('Compra parcelada excluída.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(mock.count(`POST ${API}/installment-plans/${PLAN}/restore`)).toBe(1);
  });
});
