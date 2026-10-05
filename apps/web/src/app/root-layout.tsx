import { useQueryClient } from '@tanstack/react-query';
import { Link, Outlet, useMatch, useNavigate } from 'react-router';
import { logout } from '@/features/auth/auth-api';
import { activeHousehold } from '@/features/households/browser-storage';
import { useHouseholds } from '@/features/households/households-api';
import { useSession } from '@/shared/auth/session';
import { Button } from '@/shared/ui/button';

const NEW_HOUSEHOLD = '__new__';

/** Shown only when the user belongs to more than one household (FR-HH-02). */
function HouseholdSwitcher() {
  const households = useHouseholds();
  const navigate = useNavigate();
  const match = useMatch('/casas/:householdId');
  const current = match?.params.householdId ?? '';
  if (!households.data || households.data.length < 2) {
    return null;
  }
  return (
    <select
      aria-label="Casa"
      className="min-h-9 max-w-40 rounded-lg border border-border bg-card px-2 text-sm"
      value={current}
      onChange={(event) => {
        const value = event.target.value;
        void navigate(value === NEW_HOUSEHOLD ? '/comecar' : `/casas/${value}`);
      }}
    >
      {current === '' && <option value="">Escolha a casa</option>}
      {households.data.map((household) => (
        <option key={household.id} value={household.id}>
          {household.name}
        </option>
      ))}
      <option value={NEW_HOUSEHOLD}>+ Nova casa</option>
    </select>
  );
}

function SessionMenu() {
  const session = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  if (session.status !== 'authenticated') {
    return null;
  }

  const onLogout = async () => {
    try {
      await logout();
    } finally {
      queryClient.clear();
      activeHousehold.set(null);
      await navigate('/entrar', { replace: true });
    }
  };

  return (
    <div className="flex items-center gap-2">
      <HouseholdSwitcher />
      <span className="hidden text-sm text-muted-foreground sm:inline">
        {session.user.displayName}
      </span>
      <Button variant="ghost" onClick={() => void onLogout()}>
        Sair
      </Button>
    </div>
  );
}

export function RootLayout() {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-2 px-4">
          <Link to="/" className="font-semibold text-primary">
            Couple Finance
          </Link>
          <SessionMenu />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
