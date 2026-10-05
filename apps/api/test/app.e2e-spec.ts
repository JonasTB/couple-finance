import { type INestApplication } from '@nestjs/common';
import { type App } from 'supertest/types';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from './create-test-app';

describe('API bootstrap (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health reports the database as up', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(response.body).toEqual({
      status: 'ok',
      checks: { database: 'up' },
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/) as unknown,
    });
  });

  it('assigns a request id and echoes a safe incoming one', async () => {
    const generated = await request(app.getHttpServer()).get('/api/health');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);

    const echoed = await request(app.getHttpServer())
      .get('/api/health')
      .set('x-request-id', 'client-req-0001');
    expect(echoed.headers['x-request-id']).toBe('client-req-0001');
  });

  it('returns the error envelope for unknown routes', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/does-not-exist')
      .set('x-request-id', 'client-req-0002')
      .expect(404);
    expect(response.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: expect.any(String) as unknown,
        requestId: 'client-req-0002',
      },
    });
  });

  it('serves the OpenAPI document outside production', async () => {
    const response = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(response.body).toMatchObject({
      info: { title: 'Couple Finance API' },
      paths: { '/api/health': expect.any(Object) as unknown },
    });
  });

  it('applied the baseline migration (citext, btree_gist)', async () => {
    const rows: { extname: string }[] = await app
      .get(DataSource)
      .query(
        `SELECT extname FROM pg_extension WHERE extname IN ('citext', 'btree_gist') ORDER BY extname`,
      );
    expect(rows.map((row) => row.extname)).toEqual(['btree_gist', 'citext']);
  });

  it('keeps PostgreSQL date columns as YYYY-MM-DD strings (ADR-003)', async () => {
    const rows: { d: unknown }[] = await app.get(DataSource).query(`SELECT DATE '2026-10-04' AS d`);
    expect(rows[0]?.d).toBe('2026-10-04');
  });
});
