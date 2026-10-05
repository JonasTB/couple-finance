import type { ClientErrorCode } from './request';

/** pt-BR copy per machine code. The API's `message` is for developers only. */
const MESSAGES: Record<ClientErrorCode, string> = {
  VALIDATION_FAILED: 'Alguns dados não são válidos. Revise os campos e tente novamente.',
  UNAUTHENTICATED: 'Sua sessão expirou. Entre novamente.',
  TOKEN_EXPIRED: 'Sua sessão expirou. Entre novamente.',
  REFRESH_TOKEN_ROTATED: 'Sua sessão expirou. Entre novamente.',
  INVALID_CREDENTIALS: 'E-mail ou senha incorretos.',
  EMAIL_ALREADY_REGISTERED: 'Já existe uma conta com este e-mail.',
  FORBIDDEN: 'Você não tem permissão para esta ação.',
  NOT_FOUND: 'Não encontramos o que você procurava.',
  VERSION_CONFLICT:
    'Alguém alterou estes dados agora há pouco. Atualizamos a tela; revise e tente de novo.',
  HOUSEHOLD_FULL: 'A casa já tem o número máximo de pessoas ou um convite pendente.',
  ALREADY_MEMBER: 'Esta pessoa já faz parte da casa.',
  INVITATION_INVALID: 'Este convite não é mais válido. Peça um novo link a quem convidou você.',
  INVITATION_EMAIL_MISMATCH: 'Este convite foi enviado para outro e-mail.',
  SPLIT_SUM_MISMATCH: 'Os valores de cada pessoa precisam somar exatamente o valor da despesa.',
  INCOME_BASIS_MISSING:
    'Para dividir pela renda, cada pessoa precisa ter a renda cadastrada para a data da despesa.',
  CATEGORY_ARCHIVED: 'Esta categoria foi arquivada. Escolha outra.',
  CATEGORY_NAME_TAKEN: 'Já existe uma categoria com esse nome.',
  OWNERSHIP_TRANSFER_REQUIRED: 'Antes de sair, passe a administração da casa para outra pessoa.',
  OCCURRENCE_ALREADY_CONFIRMED: 'Esta ocorrência já foi registrada como despesa.',
  OCCURRENCE_NOT_SCHEDULED:
    'Esta data não é uma ocorrência em aberto (fora da programação, pausada ou encerrada).',
  RECURRENCE_SCHEDULE_LOCKED:
    'A frequência e a data inicial não mudam depois que uma ocorrência foi registrada ou pulada. Encerre esta e crie outra.',
  INSTALLMENT_PLAN_CLOSED: 'Esta compra parcelada já foi encerrada.',
  GOAL_INSUFFICIENT_BALANCE: 'A meta não pode ficar com valor negativo.',
  ARCHIVED: 'Este item está arquivado. Restaure para alterar.',
  CONFLICT: 'Este registro foi alterado por outra pessoa. Atualize e tente de novo.',
  RATE_LIMITED: 'Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente.',
  INTERNAL_ERROR: 'Algo deu errado do nosso lado. Tente novamente em instantes.',
  NETWORK_ERROR: 'Não foi possível conectar ao servidor. Verifique sua conexão.',
  INVALID_RESPONSE: 'O servidor respondeu de forma inesperada. Tente novamente.',
};

export function errorMessage(code: ClientErrorCode): string {
  return MESSAGES[code];
}
