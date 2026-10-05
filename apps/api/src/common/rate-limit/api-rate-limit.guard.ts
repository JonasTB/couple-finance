import { type ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerRequest } from '@nestjs/throttler';

/**
 * Global guard for the general `api` throttler only (DoS protection for read models such as
 * analytics). Registered right after the JWT guard, so requests are counted per signed-in user.
 * The `ip`/`email` throttlers stay opt-in per controller.
 */
@Injectable()
export class ApiRateLimitGuard extends ThrottlerGuard {
  protected override handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    if (requestProps.throttler.name !== 'api') {
      return Promise.resolve(true);
    }
    return super.handleRequest(requestProps);
  }

  /** One budget per user (or IP) across all endpoints, not one per route handler. */
  protected override generateKey(context: ExecutionContext, suffix: string, name: string): string {
    return name === 'api' ? `${name}:${suffix}` : super.generateKey(context, suffix, name);
  }
}
