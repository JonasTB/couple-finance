import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/** Identity attached to the request by the global authentication guard. */
export interface AuthenticatedUser {
  userId: string;
}

export type AuthenticatedRequest = { user?: AuthenticatedUser };

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user) {
      // Only reachable if a @Public() route asks for the current user: a programming error.
      throw new Error('CurrentUser used on a route without authentication');
    }
    return user;
  },
);
