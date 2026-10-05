import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import { AUTH_CSRF_HEADER, AUTH_CSRF_HEADER_VALUE, ErrorCode } from '@couple-finance/shared';
import { type Request, type Response } from 'express';
import { Public } from '../../../common/auth/public.decorator';
import { AppException } from '../../../common/errors/app.exception';
import { AuthService, type SessionGrant } from '../application/auth.service';
import { CsrfHeaderGuard } from './csrf-header.guard';
import { AuthSessionDto, LoginDto, RegisterDto } from './dto/auth.dto';
import { RefreshCookie } from './refresh-cookie';

@ApiTags('auth')
@ApiHeader({ name: AUTH_CSRF_HEADER, required: true, schema: { enum: [AUTH_CSRF_HEADER_VALUE] } })
@ApiForbiddenResponse({ description: 'FORBIDDEN — missing anti-CSRF header' })
@ApiTooManyRequestsResponse({ description: 'RATE_LIMITED' })
@Public()
@UseGuards(ThrottlerGuard, CsrfHeaderGuard)
@SkipThrottle({ email: true, api: true })
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly refreshCookie: RefreshCookie,
  ) {}

  @Post('register')
  @ApiCreatedResponse({ type: AuthSessionDto, description: 'Also sets the refresh cookie.' })
  @ApiConflictResponse({ description: 'EMAIL_ALREADY_REGISTERED' })
  async register(
    @Body() body: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionDto> {
    return this.grant(response, await this.auth.register(body));
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle({ email: false })
  @ApiOkResponse({ type: AuthSessionDto, description: 'Also sets the refresh cookie.' })
  @ApiUnauthorizedResponse({ description: 'INVALID_CREDENTIALS' })
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionDto> {
    return this.grant(response, await this.auth.login(body.email, body.password));
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth()
  @ApiOkResponse({ type: AuthSessionDto, description: 'Rotates the refresh cookie.' })
  @ApiUnauthorizedResponse({
    description: 'UNAUTHENTICATED (cookie cleared) or REFRESH_TOKEN_ROTATED (retry once)',
  })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionDto> {
    const token = this.refreshCookie.read(request);
    try {
      if (!token) {
        throw new AppException(ErrorCode.UNAUTHENTICATED, 'No session.', HttpStatus.UNAUTHORIZED);
      }
      return this.grant(response, await this.auth.refresh(token));
    } catch (error) {
      // A concurrent rotation keeps the (newer) cookie; any other failure ends the session.
      if (!(error instanceof AppException && error.code === ErrorCode.REFRESH_TOKEN_ROTATED)) {
        this.refreshCookie.clear(response);
      }
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth()
  @ApiNoContentResponse({ description: 'Revokes the refresh token family and clears the cookie.' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(this.refreshCookie.read(request));
    this.refreshCookie.clear(response);
  }

  private grant(response: Response, grant: SessionGrant): AuthSessionDto {
    this.refreshCookie.set(response, grant.refreshToken.value, grant.refreshToken.expiresAt);
    return grant.session;
  }
}
