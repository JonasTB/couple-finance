import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { type AuthenticatedRequest } from './current-user.decorator';

/** Who performs a mutation, for authorization and the audit trail (ADR-008). */
export interface Actor {
  userId: string;
  requestId: string | undefined;
}

export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Actor => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest & { id?: unknown }>();
    if (!request.user) {
      throw new Error('CurrentActor used on a route without authentication');
    }
    return {
      userId: request.user.userId,
      requestId: typeof request.id === 'string' ? request.id : undefined,
    };
  },
);
