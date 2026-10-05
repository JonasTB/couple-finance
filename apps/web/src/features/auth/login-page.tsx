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
import { login } from './auth-api';
import { safeRedirectPath } from './redirect';
import { type LoginValues, loginSchema } from './schemas';

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    try {
      await login(values);
      await navigate(safeRedirectPath(params.get('redirect')), { replace: true });
    } catch (error) {
      setFormError(errorMessage(error instanceof ApiError ? error.code : 'INTERNAL_ERROR'));
    }
  });

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Entrar</h1>
        <p className="text-muted-foreground">Acesse as finanças da sua casa.</p>
      </div>
      <form className="space-y-4" noValidate onSubmit={(event) => void onSubmit(event)}>
        <FormAlert message={formError} />
        <FormField label="E-mail" error={errors.email?.message}>
          <Input type="email" autoComplete="email" inputMode="email" {...register('email')} />
        </FormField>
        <FormField label="Senha" error={errors.password?.message}>
          <Input type="password" autoComplete="current-password" {...register('password')} />
        </FormField>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Ainda não tem conta?{' '}
        <Link
          to="/criar-conta"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Criar conta
        </Link>
      </p>
    </div>
  );
}
