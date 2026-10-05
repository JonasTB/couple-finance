import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '@/app/routes';
import { refreshSession } from '@/shared/auth/session';
import { installFetchMock, type MockResponse } from './fetch-mock';

/** Renders the real route tree at `path` after restoring the session from the mocked API. */
export async function renderApp(
  path: string,
  routesMock: Record<string, MockResponse | MockResponse[]>,
) {
  const mock = installFetchMock(routesMock);
  await refreshSession();
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, mock };
}
