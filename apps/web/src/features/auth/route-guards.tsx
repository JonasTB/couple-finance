import { Navigate, Outlet, useLocation } from 'react-router';
import { useSession } from '@/shared/auth/session';

function SessionLoading() {
  return (
    <p role="status" className="py-12 text-center text-muted-foreground">
      Carregando…
    </p>
  );
}

/** Children render only for an authenticated session; others go to the login page. */
export function RequireAuth() {
  const session = useSession();
  const location = useLocation();
  if (session.status === 'unknown') {
    return <SessionLoading />;
  }
  if (session.status === 'anonymous') {
    const redirect = `${location.pathname}${location.search}`;
    const search = redirect === '/' ? '' : `?redirect=${encodeURIComponent(redirect)}`;
    return <Navigate to={`/entrar${search}`} replace />;
  }
  return <Outlet />;
}

/** Login/register pages: an authenticated user is sent to the app. */
export function GuestOnly() {
  const session = useSession();
  if (session.status === 'unknown') {
    return <SessionLoading />;
  }
  if (session.status === 'authenticated') {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
