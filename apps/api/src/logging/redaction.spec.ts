import { Writable } from 'node:stream';
import pino from 'pino';
import { LOG_REDACT_PATHS, serializeRequest } from './redaction';

function capture(): { logger: pino.Logger; lines: () => string } {
  let output = '';
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      output += chunk.toString();
      done();
    },
  });
  const logger = pino(
    {
      redact: { paths: [...LOG_REDACT_PATHS], censor: '[REDACTED]' },
      serializers: { err: pino.stdSerializers.err },
    },
    stream,
  );
  return { logger, lines: () => output };
}

describe('log redaction', () => {
  it('drops query values and Postgres details from database errors', () => {
    const { logger, lines } = capture();
    const error = Object.assign(new Error('duplicate key value violates unique constraint'), {
      query: 'INSERT INTO users (email) VALUES ($1)',
      parameters: ['ana@example.com', 123456],
      detail: 'Key (email)=(ana@example.com) already exists.',
      driverError: {
        detail: 'Key (email)=(ana@example.com) already exists.',
        parameters: [123456],
      },
    });
    logger.error({ err: error }, 'boom');
    expect(lines()).not.toContain('ana@example.com');
    expect(lines()).not.toContain('123456');
    expect(lines()).toContain('duplicate key value');
  });

  it('logs request paths without query strings', () => {
    expect(
      serializeRequest({
        id: 'r1',
        method: 'GET',
        url: '/api/v1/households/h/transactions?q=farm%C3%A1cia',
      }),
    ).toEqual({ id: 'r1', method: 'GET', url: '/api/v1/households/h/transactions' });
  });
});
