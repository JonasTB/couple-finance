import { Navigate } from 'react-router';
import { errorMessage } from '@/shared/api/error-messages';
import { ApiError } from '@/shared/api/http';
import { FormAlert } from '@/shared/ui/form-alert';
import { activeHousehold, pendingInvitation } from './browser-storage';
import { useHouseholds } from './households-api';

/** `/`: resumes a pending invitation, else opens the last used household, else onboarding. */
export function HomeRedirect() {
  const households = useHouseholds();

  if (pendingInvitation.get()) {
    return <Navigate to="/convite" replace />;
  }
  if (households.isError) {
    return (
      <FormAlert
        message={errorMessage(
          households.error instanceof ApiError ? households.error.code : 'INTERNAL_ERROR',
        )}
      />
    );
  }
  if (!households.data) {
    return (
      <p role="status" className="py-12 text-center text-muted-foreground">
        Carregando…
      </p>
    );
  }
  if (households.data.length === 0) {
    return <Navigate to="/comecar" replace />;
  }
  const remembered = activeHousehold.get();
  const target =
    households.data.find((household) => household.id === remembered) ?? households.data[0];
  return <Navigate to={`/casas/${target?.id ?? ''}`} replace />;
}
