import { ErrorCode } from '@couple-finance/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { errorMessage } from '@/shared/api/error-messages';
import { ApiError } from '@/shared/api/request';
import { Button } from '@/shared/ui/button';
import { FormAlert } from '@/shared/ui/form-alert';
import { FormField } from '@/shared/ui/form-field';
import { Input } from '@/shared/ui/input';
import { register as registerAccount } from './auth-api';
import { safeRedirectPath } from './redirect';
import { type RegisterValues, registerSchema, WEAK_PASSWORD_MESSAGE } from './schemas';

function rejectedFields(error: ApiError): string[] {
  const fields = error.details?.fields;
  if (!Array.isArray(fields)) {
    return [];
  }
  return fields.flatMap((entry: unknown) =>
    typeof entry === 'object' &&
    entry !== null &&
    'field' in entry &&
    typeof entry.field === 'string'
      ? [entry.field]
      : [],
  );
}

export function RegisterPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    try {
      await registerAccount(values);
      await navigate(safeRedirectPath(params.get('redirect')), { replace: true });
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setFormError(errorMessage('INTERNAL_ERROR'));
        return;
      }
      if (error.code === ErrorCode.EMAIL_ALREADY_REGISTERED) {
        setError('email', { message: errorMessage(error.code) });
      } else if (
        error.code === ErrorCode.VALIDATION_FAILED &&
        rejectedFields(error).includes('password')
      ) {
        setError('password', { message: WEAK_PASSWORD_MESSAGE });
      } else {
        setFormError(errorMessage(error.code));
      }
    }
  });

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Criar conta</h1>
        <p className="text-muted-foreground">
          Depois você poderá criar a casa e convidar quem divide as contas com você.
        </p>
      </div>
      <form className="space-y-4" noValidate onSubmit={(event) => void onSubmit(event)}>
        <FormAlert message={formError} />
        <FormField label="Como quer ser chamado" error={errors.displayName?.message}>
          <Input autoComplete="nickname" {...register('displayName')} />
        </FormField>
        <FormField label="E-mail" error={errors.email?.message}>
          <Input type="email" autoComplete="email" inputMode="email" {...register('email')} />
        </FormField>
        <FormField
          label="Senha"
          error={errors.password?.message}
          hint="Pelo menos 10 caracteres. Uma frase fácil de lembrar funciona bem."
        >
          <Input type="password" autoComplete="new-password" {...register('password')} />
        </FormField>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Criando conta…' : 'Criar conta'}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Já tem conta?{' '}
        <Link
          to={`/entrar${params.has('redirect') ? `?${params.toString()}` : ''}`}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Entrar
        </Link>
      </p>
    </div>
  );
}
