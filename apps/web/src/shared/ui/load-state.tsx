import { errorMessage } from '@/shared/api/error-messages';
import { ApiError } from '@/shared/api/http';
import { FormAlert } from './form-alert';

/** Loading and error feedback for a query: "Carregando…" while pending, an alert on failure. */
export function LoadState({ isPending, error }: { isPending: boolean; error: unknown }) {
  if (error) {
    return (
      <FormAlert
        message={errorMessage(error instanceof ApiError ? error.code : 'INTERNAL_ERROR')}
      />
    );
  }
  if (isPending) {
    return (
      <p role="status" className="py-6 text-center text-sm text-muted-foreground">
        Carregando…
      </p>
    );
  }
  return null;
}
