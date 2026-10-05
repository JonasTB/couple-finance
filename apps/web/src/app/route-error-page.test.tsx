import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { RouteErrorPage } from './route-error-page';

function Boom(): never {
  throw new Error('render failed');
}

describe('route error page', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('replaces a crashed page with a way out, without technical details', async () => {
    const router = createMemoryRouter([
      { path: '/', element: <Boom />, errorElement: <RouteErrorPage /> },
    ]);
    render(<RouterProvider router={router} />);
    expect(
      await screen.findByRole('heading', { name: 'Não foi possível abrir esta página' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/render failed/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/');
  });

  it('asks to reload when a page chunk is gone after a new version', async () => {
    const router = createMemoryRouter([
      {
        path: '/',
        lazy: () =>
          Promise.reject(new TypeError('Failed to fetch dynamically imported module: /x.js')),
        errorElement: <RouteErrorPage />,
      },
    ]);
    render(<RouterProvider router={router} />);
    expect(await screen.findByText(/Uma nova versão do app foi publicada/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument();
  });
});
