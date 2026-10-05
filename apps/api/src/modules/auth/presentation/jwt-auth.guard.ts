import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type AuthenticatedRequest } from '../../../common/auth/current-user.decorator';
import { IS_PUBLIC_ROUTE } from '../../../common/auth/public.decorator';
import { UsersService } from '../../users/public';
import { AccessTokens, unauthenticated } from '../application/access-tokens';

const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;

/**
 * Global guard: every route requires a valid access token unless marked @Public().
 * The user must still exist (and not be soft-deleted) on every request.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessTokens: AccessTokens,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest & { headers: Record<string, string | undefined> }>();
    const match = BEARER.exec(request.headers.authorization ?? '');
    if (!match?.[1]) {
      throw unauthenticated();
    }
    const userId = this.accessTokens.verify(match[1]);
    if (!(await this.users.exists(userId))) {
      throw unauthenticated();
    }
    request.user = { userId };
    return true;
  }
}
