import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetSessionForTests } from '@/shared/auth/session';
import { errorBody, sessionBody } from '@/test/fetch-mock';
import { renderApp } from '@/test/render-app';

const SIGNED_IN = { status: 200, body: sessionBody('a', 'Ana') };
const NO_SESSION = { status: 401, body: errorBody('UNAUTHENTICATED') };
const HID = '0199a0b0-0000-7000-8000-000000000001';
const ME = '0199a0b0-0000-7000-8000-0000000000aa';
const PARTNER = '0199a0b0-0000-7000-8000-0000000000bb';

const detail = (role: 'OWNER' | 'MEMBER' = 'OWNER') => ({
  id: HID,
  name: 'Casa da Ana',
  currency: 'BRL',
  timezone: 'America/Sao_Paulo',
  defaultSplit: { type: 'EQUAL' },
  version: 1,
  createdAt: '2026-10-04T12:00:00.000Z',
  me: { memberId: ME, role },
});

const member = (id: string, displayName: string, isMe: boolean, role = 'OWNER') => ({
  id,
  displayName,
  email: `${displayName.toLowerCase()}@example.com`,
  role,
  status: 'ACTIVE',
  joinedAt: '2026-10-04T12:00:00.000Z',
  isMe,
});

const emptyDashboard = {
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

const householdRoutes = (
  role: 'OWNER' | 'MEMBER',
  members: object[],
  invitations: object[] = [],
) => ({
  'POST /api/v1/auth/refresh': SIGNED_IN,
  'GET /api/v1/households': {
    status: 200,
    body: [
      {
        id: HID,
        name: 'Casa da Ana',
        currency: 'BRL',
        timezone: 'America/Sao_Paulo',
        role,
        activeMemberCount: members.length,
      },
    ],
  },
  [`GET /api/v1/households/${HID}`]: { status: 200, body: detail(role) },
  [`GET /api/v1/households/${HID}/members`]: { status: 200, body: members },
  [`GET /api/v1/households/${HID}/invitations`]: { status: 200, body: invitations },
  [`GET /api/v1/households/${HID}/dashboard`]: { status: 200, body: emptyDashboard },
});

describe('households onboarding', () => {
  beforeEach(() => {
    resetSessionForTests();
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState(null, '', '/');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates the first household and opens it', async () => {
    const { router, mock } = await renderApp('/', {
      ...householdRoutes('OWNER', [member(ME, 'Ana', true)]),
      'GET /api/v1/households': [
        { status: 200, body: [] },
        {
          status: 200,
          body: [
            {
              id: HID,
              name: 'Casa da Ana',
              currency: 'BRL',
              timezone: 'America/Sao_Paulo',
              role: 'OWNER',
              activeMemberCount: 1,
            },
          ],
        },
      ],
      'POST /api/v1/households': { status: 201, body: detail() },
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Criar casa' }));
    expect(await screen.findByText('Dê um nome para a casa.')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Nome da casa'), '  Casa da Ana ');
    await userEvent.click(screen.getByLabelText(/Proporcional à renda/));
    await userEvent.click(screen.getByRole('button', { name: 'Criar casa' }));

    expect(await screen.findByRole('heading', { name: 'Casa da Ana' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/casas/${HID}`);
    expect(mock.jsonBody('POST /api/v1/households')).toMatchObject({
      name: 'Casa da Ana',
      currency: 'BRL',
      defaultSplit: { type: 'INCOME_PROPORTIONAL' },
    });
    expect(localStorage.getItem('cf:activeHouseholdId')).toBe(HID);
  });

  it('lets the owner generate an invitation link carrying the token in the fragment', async () => {
    const token = 'A'.repeat(43);
    await renderApp(`/casas/${HID}/casa`, {
      ...householdRoutes('OWNER', [member(ME, 'Ana', true)]),
      [`POST /api/v1/households/${HID}/invitations`]: {
        status: 201,
        body: {
          token,
          invitation: {
            id: 'i1',
            email: 'bruno@example.com',
            status: 'PENDING',
            expiresAt: '2026-10-11T12:00:00.000Z',
            createdAt: '2026-10-04T12:00:00.000Z',
          },
        },
      },
    });

    await userEvent.type(
      await screen.findByLabelText('E-mail do(a) parceiro(a)'),
      'Bruno@Example.com',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Gerar link de convite' }));

    const link = await screen.findByLabelText('Link do convite');
    expect(link).toHaveValue(`${window.location.origin}/convite#t=${token}`);
    expect(screen.getByText(/só funciona\s+uma vez/)).toBeInTheDocument();
  });

  it('hides owner-only cards from a member', async () => {
    await renderApp(
      `/casas/${HID}/casa`,
      householdRoutes('MEMBER', [
        member(PARTNER, 'Bruno', false),
        member(ME, 'Ana', true, 'MEMBER'),
      ]),
    );
    expect(await screen.findByRole('heading', { name: 'Casa da Ana' })).toBeInTheDocument();
    expect(screen.queryByText('Convidar parceiro(a)')).not.toBeInTheDocument();
    expect(screen.queryByText('Configurações da casa')).not.toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Membros' });
    expect(within(list).getByText('bruno@example.com · Administra a casa')).toBeInTheDocument();
    expect(within(list).queryByRole('button', { name: 'Remover' })).not.toBeInTheDocument();
  });

  it('validates custom percentages before saving', async () => {
    await renderApp(
      `/casas/${HID}/casa`,
      householdRoutes('OWNER', [
        member(ME, 'Ana', true),
        member(PARTNER, 'Bruno', false, 'MEMBER'),
      ]),
    );
    await userEvent.click(await screen.findByLabelText(/Percentuais combinados/));
    const anaInput = screen.getByLabelText('Ana (%)');
    await userEvent.clear(anaInput);
    await userEvent.type(anaInput, '70');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Os percentuais precisam somar 100%.')).toBeInTheDocument();
  });
});

describe('accepting an invitation', () => {
  const TOKEN = 'B'.repeat(43);
  const preview = {
    status: 200,
    body: {
      householdName: 'Casa da Ana',
      inviterDisplayName: 'Ana',
      emailHint: 'b****@example.com',
      expiresAt: '2026-10-11T12:00:00.000Z',
    },
  };

  beforeEach(() => {
    resetSessionForTests();
    sessionStorage.clear();
    localStorage.clear();
    window.history.replaceState(null, '', `/convite#t=${TOKEN}`);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the invitation to a visitor, moves the token out of the URL, and offers sign-up', async () => {
    const { mock } = await renderApp('/convite', {
      'POST /api/v1/auth/refresh': NO_SESSION,
      'POST /api/v1/invitations/preview': preview,
    });
    expect(await screen.findByText(/convidou você para participar da casa/)).toBeInTheDocument();
    expect(window.location.hash).toBe('');
    expect(sessionStorage.getItem('cf:pendingInvitationToken')).toBe(TOKEN);
    expect(screen.getByRole('link', { name: 'Criar conta' })).toHaveAttribute(
      'href',
      '/criar-conta?redirect=%2Fconvite',
    );
    expect(mock.jsonBody('POST /api/v1/invitations/preview')).toEqual({ token: TOKEN });
  });

  it('accepts as a signed-in user and opens the household', async () => {
    const { router } = await renderApp('/convite', {
      ...householdRoutes('MEMBER', [
        member(PARTNER, 'Bruno', false),
        member(ME, 'Ana', true, 'MEMBER'),
      ]),
      'POST /api/v1/invitations/preview': preview,
      'POST /api/v1/invitations/accept': { status: 200, body: { householdId: HID } },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Aceitar convite' }));
    expect(await screen.findByRole('heading', { name: 'Casa da Ana' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/casas/${HID}`);
    expect(sessionStorage.getItem('cf:pendingInvitationToken')).toBeNull();
  });

  it('explains an email mismatch', async () => {
    await renderApp('/convite', {
      'POST /api/v1/auth/refresh': SIGNED_IN,
      'POST /api/v1/invitations/preview': preview,
      'POST /api/v1/invitations/accept': {
        status: 403,
        body: errorBody('INVITATION_EMAIL_MISMATCH'),
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Aceitar convite' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/enviado para outro e-mail/);
  });

  it('explains an invalid or expired invitation', async () => {
    await renderApp('/convite', {
      'POST /api/v1/auth/refresh': NO_SESSION,
      'POST /api/v1/invitations/preview': { status: 422, body: errorBody('INVITATION_INVALID') },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(/não é mais válido/);
    expect(sessionStorage.getItem('cf:pendingInvitationToken')).toBeNull();
  });

  it('offers a way out of a household the user can no longer open, on any tab', async () => {
    localStorage.setItem('cf:activeHouseholdId', HID);
    const { router } = await renderApp(`/casas/${HID}/categorias`, {
      'POST /api/v1/auth/refresh': SIGNED_IN,
      [`GET /api/v1/households/${HID}`]: { status: 404, body: errorBody('NOT_FOUND') },
      [`GET /api/v1/households/${HID}/categories`]: { status: 404, body: errorBody('NOT_FOUND') },
      'GET /api/v1/households': { status: 200, body: [] },
    });
    // The layout replaces the whole tab (the page's own alert may show first).
    const back = await screen.findByRole('button', { name: 'Voltar ao início' });
    expect(screen.getByText('Não encontramos o que você procurava.')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Seções da casa' })).not.toBeInTheDocument();
    await userEvent.click(back);
    expect(localStorage.getItem('cf:activeHouseholdId')).toBeNull();
    await vi.waitFor(() => {
      expect(router.state.location.pathname).toBe('/comecar');
    });
  });
});
