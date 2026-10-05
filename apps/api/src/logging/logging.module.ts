import { type IncomingMessage, type ServerResponse } from 'node:http';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { IdGenerator } from '../common/ids/id-generator';
import { type Env } from '../config/env';
import { LOG_REDACT_PATHS, serializeRequest, serializeResponse } from './redaction';

const REQUEST_ID_HEADER = 'x-request-id';
const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Structured JSON logs with a request/correlation id. Never logs bodies, credentials or
 * cookies (SECURITY_PRIVACY.md §3).
 */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ConfigService, IdGenerator],
      useFactory: (config: ConfigService<Env, true>, ids: IdGenerator) => {
        const nodeEnv = config.get('NODE_ENV', { infer: true });
        return {
          pinoHttp: {
            // Tests are silent unless E2E_LOG_LEVEL is set (debugging aid, e.g. E2E_LOG_LEVEL=error).
            level:
              nodeEnv === 'test'
                ? (process.env.E2E_LOG_LEVEL ?? 'silent')
                : config.get('LOG_LEVEL', { infer: true }),
            genReqId: (request: IncomingMessage, response: ServerResponse) => {
              const incoming = request.headers[REQUEST_ID_HEADER];
              const id =
                typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming)
                  ? incoming
                  : ids.next();
              response.setHeader(REQUEST_ID_HEADER, id);
              return id;
            },
            customProps: () => ({ service: 'couple-finance-api' }),
            redact: { paths: [...LOG_REDACT_PATHS], censor: '[REDACTED]' },
            serializers: { req: serializeRequest, res: serializeResponse },
            transport:
              nodeEnv === 'development'
                ? { target: 'pino-pretty', options: { singleLine: true } }
                : undefined,
          },
        };
      },
    }),
  ],
})
export class LoggingModule {}
