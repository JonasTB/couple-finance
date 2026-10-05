import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { Button } from '@/shared/ui/button';

/** A lazy page chunk that no longer exists on the server (usually right after a deploy). */
function isStaleChunk(error: unknown): boolean {
  return (
    error instanceof Error &&
    /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(
      error.message,
    )
  );
}

/**
 * Route-level error screen (render errors, failed page loads). Never shows technical details
 * (React Router already reports the caught error in the console during development).
 */
export function RouteErrorPage() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  const stale = isStaleChunk(error);

  return (
    <div role="alert" className="space-y-4 py-6">
      <h2 className="text-xl font-semibold">
        {notFound ? 'Página não encontrada' : 'Não foi possível abrir esta página'}
      </h2>
      <p className="text-muted-foreground">
        {notFound
          ? 'O endereço acessado não existe.'
          : stale
            ? 'Uma nova versão do app foi publicada. Recarregue para continuar.'
            : 'Algo deu errado do nosso lado. Seus dados estão seguros; tente de novo.'}
      </p>
      <div className="flex flex-wrap gap-2">
        {!notFound && (
          <Button
            onClick={() => {
              window.location.reload();
            }}
          >
            {stale ? 'Recarregar' : 'Tentar de novo'}
          </Button>
        )}
        <Button asChild variant="outline">
          <Link to="/" reloadDocument>
            Voltar ao início
          </Link>
        </Button>
      </div>
    </div>
  );
}
