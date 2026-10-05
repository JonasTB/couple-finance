import {
  DISPLAY_NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@couple-finance/shared';
import { z } from 'zod';

const email = z
  .string()
  .trim()
  .min(1, 'Informe seu e-mail.')
  .pipe(z.email('Informe um e-mail válido.'));

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Informe sua senha.'),
});

export const registerSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, 'Informe como quer ser chamado.')
    .max(DISPLAY_NAME_MAX_LENGTH, `Use no máximo ${DISPLAY_NAME_MAX_LENGTH} caracteres.`),
  email,
  // Passwords are never trimmed; strength rules (common passwords etc.) are enforced by the API.
  password: z
    .string()
    .refine((value) => Array.from(value).length >= PASSWORD_MIN_LENGTH, {
      message: `Use pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`,
    })
    .refine((value) => Array.from(value).length <= PASSWORD_MAX_LENGTH, {
      message: `Use no máximo ${PASSWORD_MAX_LENGTH} caracteres.`,
    }),
});

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;

export const WEAK_PASSWORD_MESSAGE =
  'Escolha uma senha mais difícil de adivinhar: evite sequências, senhas comuns ou partes do seu e-mail.';
