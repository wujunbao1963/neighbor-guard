import 'dotenv/config';
import { DataSource } from 'typeorm';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`${name} is required (set it in .env)`);
  }
  return v;
}

const sslEnabled = process.env.DB_SSL === 'true';
const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';

/**
 * TypeORM CLI DataSource.
 * Used by: npm run db:migrate (and related scripts)
 */
export default new DataSource({
  type: 'postgres',
  url: requireEnv('DATABASE_URL'),
  ssl: sslEnabled ? { rejectUnauthorized } : false,

  // Step 2: include entities for CLI tooling (migrations still manual in this step).
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
  migrationsTableName: 'ng_typeorm_migrations',
  synchronize: false,
  logging: ['error'],
});
