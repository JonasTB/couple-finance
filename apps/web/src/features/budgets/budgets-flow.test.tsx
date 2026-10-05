import type { BudgetMonthView, BudgetStatusView } from '@couple-finance/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetSessionForTests } from '@/shared/auth/session';
import { sessionBody } from '@/test/fetch-mock';
import { renderApp } from '@/test/render-app';

const HID = '0199a0b0-0000-7000-8000-000000000001';
const ANA = '0199a0b0-0000-7000-8000-0000000000aa';
const MORADIA = '0199a0b0-0000-7000-8000-0000000000c1';
const MERCADO = '0199a0b0-0000-7000-8000-0000000000c2';
const API = `/api/v1/households/${HID}`;

const budget = (overrides: Partial<BudgetStatusView>): BudgetStatusView => ({
  id: 'b-total',
  categoryId: null,
  categoryName: null,
  categoryArchived: false,
  amountCents: 300000,
  spentCents: 178000,
  remainingCents: 122000,
  usedBps: 5933,
  state: 'OK',
  fromMonth: '2026-10',
  toMonth: null,
  next: null,
  ...overrides,
});

const october: BudgetMonthView = {
  month: '2026-10',
  editable: true,
  data: [
    budget({ toMonth: '2026-11', next: { fromMonth: '2026-12', amountCents: 350000 } }),
    budget({
      id: 'b-mercado',
      categoryId: MERCADO,
      categoryName: 'Mercado',
      amountCents: 50000,
      spentCents: 58000,
      remainingCents: -8000,
      usedBps: 11600,
      state: 'EXCEEDED',
    }),
    budget({
      id: 'b-moradia',
      categoryId: MORADIA,
      categoryName: 'Moradia',
      amountCents: 150000,
      spentCents: 120000,
      remainingCents: 30000,
      usedBps: 8000,
      state: 'WARNING',
    }),
  ],
};

const routes = (month: BudgetMonthView = october) => ({
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
  [`GET ${API}/categories`]: {
    status: 200,
    body: [
      {
        id: MERCADO,
        name: 'Mercado',
        parentId: null,
        isSystem: true,
        archived: false,
        children: [],
      },
      {
        id: MORADIA,
        name: 'Moradia',
        parentId: null,
        isSystem: true,
        archived: false,
        children: [],
      },
    ],
  },
  [`GET ${API}/budgets`]: { status: 200, body: month },
  [`POST ${API}/budgets/changes`]: { status: 200, body: month },
});

describe('budgets', () => {
  beforeEach(() => {
    resetSessionForTests();
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows usage with alert labels, not color alone (FR-BUD-02)', async () => {
    await renderApp(`/casas/${HID}/orcamentos`, routes());
    const list = await screen.findByRole('list', { name: 'Orçamentos' });
    expect(
      within(list).getByRole('meter', { name: 'Total da casa: 59,33% usado' }),
    ).toHaveAttribute('aria-valuenow', '59.33');
    expect(within(list).getByRole('meter', { name: 'Mercado: 116% usado' })).toHaveAttribute(
      'aria-valuenow',
      '100',
    );
    expect(within(list).getByText('Limite ultrapassado')).toBeInTheDocument();
    expect(within(list).getByText(/R\$\s80,00 acima do limite/)).toBeInTheDocument();
    expect(within(list).getByText('Perto do limite')).toBeInTheDocument();
    expect(
      within(list).getByText(/A partir de dezembro de 2026: R\$\s3\.500,00\./),
    ).toBeInTheDocument();
  });

  it('creates, changes and removes budgets from a month on (FR-BUD-03)', async () => {
    const { mock } = await renderApp(`/casas/${HID}/orcamentos`, routes());
    await userEvent.click(await screen.findByRole('button', { name: 'Novo orçamento' }));
    let form = screen.getByRole('form', { name: 'Definir orçamento' });
    await userEvent.selectOptions(within(form).getByLabelText('Orçamento de'), MORADIA);
    await userEvent.type(within(form).getByLabelText('Valor por mês'), '1.800,00');
    await userEvent.selectOptions(within(form).getByLabelText('A partir de'), '2026-11');
    await userEvent.click(within(form).getByRole('button', { name: 'Salvar' }));
    expect(mock.jsonBody(`POST ${API}/budgets/changes`)).toEqual({
      categoryId: MORADIA,
      amountCents: 180000,
      fromMonth: '2026-11',
    });

    await userEvent.click(
      screen.getByRole('button', { name: 'Alterar orçamento de Total da casa' }),
    );
    form = screen.getByRole('form', { name: 'Definir orçamento' });
    expect(within(form).getByLabelText('Orçamento de')).toBeDisabled();
    expect(within(form).getByLabelText('Valor por mês')).toHaveValue('3.000,00');

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Remover orçamento de Mercado' }));
    await vi.waitFor(() => {
      expect(mock.count(`POST ${API}/budgets/changes`)).toBe(2);
    });
    const bodies = mock.calls
      .filter((call) => call.key === `POST ${API}/budgets/changes`)
      .map((call) => JSON.parse(call.init?.body as string) as unknown);
    expect(bodies[1]).toEqual({ categoryId: MERCADO, amountCents: null, fromMonth: '2026-10' });
  });

  it('keeps past months read-only', async () => {
    await renderApp(
      `/casas/${HID}/orcamentos`,
      routes({ ...october, month: '2026-09', editable: false }),
    );
    expect(await screen.findByText(/Meses passados não mudam/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Alterar|Remover|Novo orçamento/ })).toBeNull();
  });
});
