import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetSessionForTests } from '@/shared/auth/session';
import { errorBody, type MockResponse, sessionBody } from '@/test/fetch-mock';
import { renderApp } from '@/test/render-app';

const HID = '0199a0b0-0000-7000-8000-000000000001';
const ANA = '0199a0b0-0000-7000-8000-0000000000aa';
const BRUNO = '0199a0b0-0000-7000-8000-0000000000bb';
const MERCADO = '0199a0b0-0000-7000-8000-0000000000c1';
const SUPERMERCADO = '0199a0b0-0000-7000-8000-0000000000c2';
const TX = '0199a0b0-0000-7000-8000-0000000000d1';
const API = `/api/v1/households/${HID}`;

const members = [
  {
    id: ANA,
    displayName: 'Ana',
    email: 'ana@example.com',
    role: 'OWNER',
    status: 'ACTIVE',
    incomeVisibility: 'RATIO_ONLY',
    joinedAt: '2026-01-01T00:00:00.000Z',
    isMe: true,
  },
  {
    id: BRUNO,
    displayName: 'Bruno',
    email: 'bruno@example.com',
    role: 'MEMBER',
    status: 'ACTIVE',
    incomeVisibility: 'RATIO_ONLY',
    joinedAt: '2026-01-02T00:00:00.000Z',
    isMe: false,
  },
];
const categories = [
  {
    id: MERCADO,
    name: 'Mercado',
    parentId: null,
    isSystem: true,
    archived: false,
    children: [
      {
        id: SUPERMERCADO,
        name: 'Supermercado',
        parentId: MERCADO,
        isSystem: true,
        archived: false,
        children: [],
      },
    ],
  },
];
const transaction = {
  id: TX,
  description: 'Supermercado do mês',
  amountCents: 10001,
  date: '2026-10-03',
  categoryId: SUPERMERCADO,
  payerMemberId: BRUNO,
  paymentMethod: 'PIX',
  notes: null,
  tags: [],
  split: {
    type: 'EQUAL',
    weights: [
      { memberId: ANA, weight: 1 },
      { memberId: BRUNO, weight: 1 },
    ],
  },
  allocations: [
    { memberId: ANA, amountCents: 5001 },
    { memberId: BRUNO, amountCents: 5000 },
  ],
  createdByMemberId: ANA,
  version: 1,
  createdAt: '2026-10-03T12:00:00.000Z',
  updatedAt: '2026-10-03T12:00:00.000Z',
  deletedAt: null,
};
const LIST_OCTOBER = `GET ${API}/transactions?from=2026-10-01&to=2026-10-31&limit=50`;

function householdRoutes(extra: Record<string, MockResponse | MockResponse[]> = {}) {
  return {
    'POST /api/v1/auth/refresh': { status: 200, body: sessionBody('a', 'Ana') },
    'GET /api/v1/households': { status: 200, body: [] },
    [`GET ${API}`]: {
      status: 200,
      body: {
        id: HID,
        name: 'Casa da Ana',
        currency: 'BRL',
        timezone: 'America/Sao_Paulo',
        defaultSplit: { type: 'EQUAL' },
        version: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        me: { memberId: ANA, role: 'OWNER' },
      },
    },
    [`GET ${API}/members`]: { status: 200, body: members },
    [`GET ${API}/categories`]: { status: 200, body: categories },
    [`GET ${API}/categories?includeArchived=true`]: { status: 200, body: categories },
    ...extra,
  };
}

describe('ledger screens', () => {
  beforeEach(() => {
    resetSessionForTests();
    localStorage.clear();
    // Only Date is faked: "today" is 2026-10-04 in São Paulo; timers stay real.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-04T15:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('creates an expense with the household default split and a server-side preview', async () => {
    const { mock, router } = await renderApp(
      `/casas/${HID}/despesas/nova`,
      householdRoutes({
        [`POST ${API}/transactions/preview-split`]: {
          status: 200,
          body: {
            split: { type: 'EQUAL', weights: [] },
            allocations: [
              { memberId: ANA, amountCents: 2295 },
              { memberId: BRUNO, amountCents: 2295 },
            ],
          },
        },
        [`POST ${API}/transactions`]: { status: 201, body: transaction },
        [LIST_OCTOBER]: {
          status: 200,
          body: { data: [transaction], page: { nextCursor: null, limit: 50 } },
        },
      }),
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Salvar despesa' }));
    expect(await screen.findByText('Informe o valor (ex.: 45,90).')).toBeInTheDocument();
    expect(screen.getByText('Escolha a categoria.')).toBeInTheDocument();

    expect(screen.getByLabelText('Data')).toHaveValue('2026-10-04');
    await userEvent.type(screen.getByLabelText('Valor'), '45,90');
    await userEvent.type(screen.getByLabelText('Descrição'), 'Feira');
    await userEvent.selectOptions(screen.getByLabelText('Categoria'), SUPERMERCADO);

    // Preview computed by the API, not by the component.
    expect(await screen.findByText('Cada pessoa fica responsável por:')).toBeInTheDocument();
    expect(mock.jsonBody(`POST ${API}/transactions/preview-split`)).toEqual({
      amountCents: 4590,
      date: '2026-10-04',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Salvar despesa' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/casas/${HID}/despesas`);
    });
    expect(mock.jsonBody(`POST ${API}/transactions`)).toEqual({
      description: 'Feira',
      amountCents: 4590,
      date: '2026-10-04',
      categoryId: SUPERMERCADO,
      payerMemberId: ANA,
      paymentMethod: 'PIX',
      notes: null,
      tags: [],
    });
  });

  it('sends an individual split for someone other than the payer', async () => {
    const { mock } = await renderApp(
      `/casas/${HID}/despesas/nova`,
      householdRoutes({
        [`POST ${API}/transactions/preview-split`]: {
          status: 200,
          body: {
            split: { type: 'INDIVIDUAL', weights: [] },
            allocations: [{ memberId: BRUNO, amountCents: 12000 }],
          },
        },
        [`POST ${API}/transactions`]: { status: 201, body: transaction },
        [LIST_OCTOBER]: { status: 200, body: { data: [], page: { nextCursor: null, limit: 50 } } },
      }),
    );
    await userEvent.type(await screen.findByLabelText('Valor'), '120');
    await userEvent.type(screen.getByLabelText('Descrição'), 'Tênis');
    await userEvent.selectOptions(screen.getByLabelText('Categoria'), MERCADO);
    await userEvent.selectOptions(screen.getByLabelText('Divisão'), 'INDIVIDUAL');
    await userEvent.selectOptions(screen.getByLabelText('Despesa de'), BRUNO);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar despesa' }));
    await waitFor(() => {
      expect(mock.count(`POST ${API}/transactions`)).toBe(1);
    });
    expect(mock.jsonBody(`POST ${API}/transactions`)).toMatchObject({
      amountCents: 12000,
      payerMemberId: ANA,
      split: { type: 'INDIVIDUAL', responsibleMemberId: BRUNO },
    });
  });

  it('explains a custom-amount mismatch returned by the server', async () => {
    await renderApp(
      `/casas/${HID}/despesas/nova`,
      householdRoutes({
        [`POST ${API}/transactions/preview-split`]: {
          status: 422,
          body: errorBody('SPLIT_SUM_MISMATCH'),
        },
      }),
    );
    await userEvent.type(await screen.findByLabelText('Valor'), '100');
    await userEvent.selectOptions(screen.getByLabelText('Divisão'), 'CUSTOM_AMOUNT');
    await userEvent.type(screen.getByLabelText('Ana (valor)'), '60');
    await userEvent.type(screen.getByLabelText('Bruno (valor)'), '30');
    expect(
      await screen.findByText(/precisam somar exatamente o valor da despesa/),
    ).toBeInTheDocument();
  });

  it('edits keeping the stored split and shows the history', async () => {
    const { mock } = await renderApp(
      `/casas/${HID}/despesas/${TX}`,
      householdRoutes({
        [`GET ${API}/transactions/${TX}`]: { status: 200, body: transaction },
        [`GET ${API}/transactions/${TX}/history`]: {
          status: 200,
          body: [
            {
              action: 'CREATE',
              actorDisplayName: 'Ana',
              occurredAt: '2026-10-03T12:00:00.000Z',
              before: null,
              after: null,
            },
          ],
        },
        [`PATCH ${API}/transactions/${TX}`]: {
          status: 200,
          body: { ...transaction, amountCents: 20000, version: 2 },
        },
        [`DELETE ${API}/transactions/${TX}`]: { status: 204 },
        [`POST ${API}/transactions/${TX}/restore`]: { status: 200, body: transaction },
        [LIST_OCTOBER]: {
          status: 200,
          body: { data: [transaction], page: { nextCursor: null, limit: 50 } },
        },
      }),
    );

    const amount = await screen.findByLabelText('Valor');
    expect(amount).toHaveValue('100,01');
    expect(await screen.findByText(/Ana criou esta despesa/)).toBeInTheDocument();
    await userEvent.clear(amount);
    await userEvent.type(amount, '200');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => {
      expect(mock.count(`PATCH ${API}/transactions/${TX}`)).toBe(1);
    });
    const patch = mock.jsonBody(`PATCH ${API}/transactions/${TX}`) as Record<string, unknown>;
    expect(patch).toMatchObject({ version: 1, amountCents: 20000 });
    expect(patch).not.toHaveProperty('split'); // keeps the stored basis (ADR-006)
  });

  it('lists the month grouped by day with payer and split, and restores from the undo banner', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { mock } = await renderApp(
      `/casas/${HID}/despesas/${TX}`,
      householdRoutes({
        [`GET ${API}/transactions/${TX}`]: { status: 200, body: transaction },
        [`GET ${API}/transactions/${TX}/history`]: { status: 200, body: [] },
        [`DELETE ${API}/transactions/${TX}`]: { status: 204 },
        [`POST ${API}/transactions/${TX}/restore`]: { status: 200, body: transaction },
        [LIST_OCTOBER]: {
          status: 200,
          body: { data: [transaction], page: { nextCursor: null, limit: 50 } },
        },
      }),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Excluir' }));

    expect(await screen.findByText('Despesa excluída.')).toBeInTheDocument();
    // The list reloads after the deletion; wait for it instead of racing it.
    const day = await screen.findByRole('region', { name: /3 de outubro/ });
    expect(within(day).getByText('Supermercado do mês')).toBeInTheDocument();
    expect(
      within(day).getByText(/Mercado › Supermercado · Pago por Bruno · Dividir igualmente/),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    await waitFor(() => {
      expect(mock.count(`POST ${API}/transactions/${TX}/restore`)).toBe(1);
    });
  });

  it('shows income proportions, hides partner amounts and explains the inference caveat', async () => {
    const { mock } = await renderApp(
      `/casas/${HID}/renda`,
      householdRoutes({
        [`GET ${API}/incomes`]: {
          status: 200,
          body: {
            date: '2026-10-04',
            members: [
              {
                memberId: ANA,
                isMe: true,
                visibility: 'RATIO_ONLY',
                hasIncome: true,
                monthlyAmountCents: 600000,
                shareBps: 6000,
              },
              {
                memberId: BRUNO,
                isMe: false,
                visibility: 'RATIO_ONLY',
                hasIncome: true,
                monthlyAmountCents: null,
                shareBps: 4000,
              },
            ],
          },
        },
        [`GET ${API}/incomes/me`]: {
          status: 200,
          body: [
            {
              id: 'r1',
              monthlyAmountCents: 600000,
              effectiveFrom: '2026-01-01',
              effectiveTo: null,
            },
          ],
        },
        [`POST ${API}/incomes/me`]: {
          status: 201,
          body: {
            id: 'r2',
            monthlyAmountCents: 650000,
            effectiveFrom: '2026-10-01',
            effectiveTo: null,
          },
        },
      }),
    );

    expect(await screen.findByText('Valor oculto')).toBeInTheDocument();
    expect(screen.getByText('60% da renda da casa')).toBeInTheDocument();
    expect(
      screen.getByText(/quem sabe a própria renda consegue deduzir a sua/),
    ).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Novo valor mensal'), '6.500,00');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => {
      expect(mock.count(`POST ${API}/incomes/me`)).toBe(1);
    });
    expect(mock.jsonBody(`POST ${API}/incomes/me`)).toEqual({
      monthlyAmountCents: 650000,
      effectiveFrom: '2026-10-01',
    });
  });

  it('explains a duplicate category name', async () => {
    await renderApp(
      `/casas/${HID}/categorias`,
      householdRoutes({
        [`POST ${API}/categories`]: { status: 409, body: errorBody('CATEGORY_NAME_TAKEN') },
      }),
    );
    await userEvent.type(await screen.findByLabelText('Nome'), 'mercado');
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Já existe uma categoria com esse nome neste nível.',
    );
  });
});
