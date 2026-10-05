import { type INestApplication, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AllExceptionsFilter } from '../common/errors/all-exceptions.filter';
import { createValidationPipe } from '../common/errors/validation';
import { type Env } from '../config/env';

/**
 * HTTP pipeline shared by `main.ts` and the e2e tests, so tests exercise the real setup.
 * Routes: `/api/v1/...` (ADR-010); `/api/health` is version-neutral; Swagger at `/api/docs`.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const isProduction = config.get('NODE_ENV', { infer: true }) === 'production';

  app.useLogger(app.get(Logger));
  // Behind a proxy (Vercel), req.ip must come from X-Forwarded-For for per-IP rate limits.
  (app.getHttpAdapter().getInstance() as { set: (key: string, value: unknown) => void }).set(
    'trust proxy',
    config.get('TRUST_PROXY', { infer: true }),
  );
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: config.get('CORS_ORIGINS', { infer: true }), credentials: true });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  // Swagger exposure in production is decided in Stage 13 (API_CONVENTIONS.md §1).
  if (!isProduction) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Couple Finance API')
        .setDescription('Shared financial workspace for couples. Money in integer cents (ADR-002).')
        .setVersion('1')
        .addBearerAuth()
        .addCookieAuth('cf_refresh')
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document);
  }
}
