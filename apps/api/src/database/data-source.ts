// Used only by the TypeORM CLI (`pnpm --filter @couple-finance/api migration:*`).
// Migrations take a direct connection when one is provided (Neon injects DATABASE_URL_UNPOOLED):
// DDL and long transactions should not go through a transaction-mode pooler.
import '../config/register-env';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './typeorm-options';

const databaseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run migrations');
}

export default new DataSource(buildDataSourceOptions(databaseUrl));
