import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiRateLimitGuard } from '../../common/rate-limit/api-rate-limit.guard';
import { type Env } from '../../config/env';
import { UsersModule } from '../users/public';
import { AccessTokens } from './application/access-tokens';
import { AuthService } from './application/auth.service';
import { PasswordHasher, RefreshTokenStore } from './application/ports';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher';
import { RefreshTokenEntity } from './infrastructure/refresh-token.entity';
import { TypeOrmRefreshTokenStore } from './infrastructure/typeorm-refresh-token.store';
import { AuthController } from './presentation/auth.controller';
import { CsrfHeaderGuard } from './presentation/csrf-header.guard';
import { JwtAuthGuard } from './presentation/jwt-auth.guard';
import { RefreshCookie } from './presentation/refresh-cookie';

@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forFeature([RefreshTokenEntity]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
        signOptions: { algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AccessTokens,
    RefreshCookie,
    CsrfHeaderGuard,
    { provide: PasswordHasher, useClass: Argon2PasswordHasher },
    { provide: RefreshTokenStore, useClass: TypeOrmRefreshTokenStore },
    // Order matters: authentication first, so the general rate limit counts per user.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ApiRateLimitGuard },
  ],
})
export class AuthModule {}
