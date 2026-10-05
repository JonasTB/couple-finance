import { useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useParams } from 'react-router';
import { errorMessage } from '@/shared/api/error-messages';
import { ApiError } from '@/shared/api/http';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/button';
import { FormAlert } from '@/shared/ui/form-alert';
import { activeHousehold } from './browser-storage';
import { useHousehold } from './households-api';

const TABS = [
  { to: '', label: 'Visão geral', end: true },
  { to: 'despesas', label: 'Despesas', end: false },
  { to: 'compromissos', label: 'Compromissos', end: false },
  { to: 'orcamentos', label: 'Orçamentos', end: false },
  { to: 'metas', label: 'Metas', end: false },
  { to: 'analises', label: 'Análises', end: false },
  { to: 'categorias', label: 'Categorias', end: false },
  { to: 'renda', label: 'Renda', end: false },
  { to: 'casa', label: 'Casa', end: false },
];

/** Shell for every page of one household: name + section tabs. */
export function HouseholdLayout() {
  const { householdId = '' } = useParams();
  const household = useHousehold(householdId);
  const navigate = useNavigate();

  // Remember the last household opened (any tab) for the home redirect.
  useEffect(() => {
    if (household.data) {
      activeHousehold.set(household.data.id);
    }
  }, [household.data]);

  if (household.error) {
    // Unknown household or no longer a member (404), on any tab: offer a way out.
    return (
      <div className="space-y-4">
        <FormAlert
          message={errorMessage(
            household.error instanceof ApiError ? household.error.code : 'INTERNAL_ERROR',
          )}
        />
        <Button
          variant="outline"
          onClick={() => {
            activeHousehold.set(null);
            void navigate('/', { replace: true });
          }}
        >
          Voltar ao início
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">{household.data?.name ?? ' '}</h1>
        <nav aria-label="Seções da casa" className="-mx-4 overflow-x-auto px-4">
          <ul className="flex gap-1 border-b border-border">
            {TABS.map((tab) => (
              <li key={tab.label}>
                <NavLink
                  to={tab.to}
                  end={tab.end}
                  className={({ isActive }) =>
                    cn(
                      'inline-flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 text-sm font-medium',
                      isActive
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground',
                    )
                  }
                >
                  {tab.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <Outlet />
    </div>
  );
}
