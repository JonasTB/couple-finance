import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type CookieOptions, type Request, type Response } from 'express';
import { type Env } from '../../../config/env';

export const REFRESH_COOKIE_NAME = 'cf_refresh';
/** The cookie is only ever sent to the auth endpoints (ADR-004). */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

@Injectable()
export class RefreshCookie {
  private readonly baseOptions: CookieOptions;

  constructor(config: ConfigService<Env, true>) {
    this.baseOptions = {
      httpOnly: true,
      // Browsers accept Secure cookies on http://localhost, but some test clients do not;
      // production always uses Secure.
      secure: config.get('NODE_ENV', { infer: true }) === 'production',
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
    };
  }

  read(request: Request): string | undefined {
    const cookies: unknown = request.cookies;
    if (typeof cookies !== 'object' || cookies === null || !(REFRESH_COOKIE_NAME in cookies)) {
      return undefined;
    }
    const value: unknown = (cookies as Record<string, unknown>)[REFRESH_COOKIE_NAME];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  set(response: Response, value: string, expiresAt: Date): void {
    response.cookie(REFRESH_COOKIE_NAME, value, { ...this.baseOptions, expires: expiresAt });
  }

  clear(response: Response): void {
    response.clearCookie(REFRESH_COOKIE_NAME, this.baseOptions);
  }
}
