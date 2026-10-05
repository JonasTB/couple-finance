import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '@/app/routes';
import { refreshSession, resetSessionForTests } from '@/shared/auth/session';
import { errorBody, installFetchMock, type MockResponse, sessionBody } from '@/test/fetch-mock';

const NO_HOUSEHOLDS = { status: 200, body: [] };
const NO_SESSION = { status: 401, body: errorBody('UNAUTHENTICATED') };

async function renderApp(path: string, routesMock: Record<string, MockResponse | MockResponse[]>) {
  installFetchMock({ 'GET /api/v1/households': NO_HOUSEHOLDS, ...routesMock });
  await refreshSession();
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('authentication flow', () => {
  beforeEach(() => {
    resetSessionForTests();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends anonymous visitors to the login page, keeping the destination', async () => {
    const router = await renderApp('/', { 'POST /api/v1/auth/refresh': NO_SESSION });
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/entrar');
  });

  it('restores an existing session on load', async () => {
    const router = await renderApp('/', {
      'POST /api/v1/auth/refresh': { status: 200, body: sessionBody('a', 'Sam') },
    });
    expect(await screen.findByRole('heading', { name: 'Crie a sua casa' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/comecar');
    expect(screen.getByText('Sam')).toBeInTheDocument();
  });

  it('validates the login form before calling the API', async () => {
    await renderApp('/entrar', { 'POST /api/v1/auth/refresh': NO_SESSION });
    await userEvent.click(await screen.findByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('Informe seu e-mail.')).toBeInTheDocument();
    expect(screen.getByText('Informe sua senha.')).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows a neutral message for wrong credentials', async () => {
    await renderApp('/entrar', {
      'POST /api/v1/auth/refresh': NO_SESSION,
      'POST /api/v1/auth/login': { status: 401, body: errorBody('INVALID_CREDENTIALS') },
    });
    await userEvent.type(await screen.findByLabelText('E-mail'), 'alex@example.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'wrong password');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos.');
  });

  it('logs in and returns to the requested page', async () => {
    const router = await renderApp('/entrar?redirect=%2F', {
      'POST /api/v1/auth/refresh': NO_SESSION,
      'POST /api/v1/auth/login': { status: 200, body: sessionBody('a', 'Alex') },
    });
    await userEvent.type(await screen.findByLabelText('E-mail'), 'alex@example.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'cafe com leite na varanda');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    // A user without households lands on onboarding.
    expect(await screen.findByRole('heading', { name: 'Crie a sua casa' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/comecar');
  });

  it('maps registration conflicts and weak passwords to the right fields', async () => {
    await renderApp('/criar-conta', {
      'POST /api/v1/auth/refresh': NO_SESSION,
      'POST /api/v1/auth/register': [
        { status: 409, body: errorBody('EMAIL_ALREADY_REGISTERED') },
        {
          status: 400,
          body: errorBody('VALIDATION_FAILED', {
            details: { fields: [{ field: 'password', constraints: ['PASSWORD_TOO_COMMON'] }] },
          }),
        },
      ],
    });
    await userEvent.type(await screen.findByLabelText('Como quer ser chamado'), 'Alex');
    await userEvent.type(screen.getByLabelText('E-mail'), 'alex@example.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'Senha12345');
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(await screen.findByText('Já existe uma conta com este e-mail.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(await screen.findByText(/Escolha uma senha mais difícil/)).toBeInTheDocument();
  });

  it('logs out and returns to the login page', async () => {
    const router = await renderApp('/', {
      'POST /api/v1/auth/refresh': { status: 200, body: sessionBody('a', 'Alex') },
      'POST /api/v1/auth/logout': { status: 204 },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Sair' }));
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/entrar');
  });
});
