import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * E2E tests run against a separate database: the dev DATABASE_URL with the database
 * name replaced by "<name>_test". The dev data is never touched.
 */
export function testDatabaseUrl(): string {
  let raw = process.env.TEST_DATABASE_URL;
  if (!raw) {
    const envFile = readFileSync(join(__dirname, '..', '.env'), 'utf8');
    const line = envFile.split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
    if (!line) throw new Error('DATABASE_URL not found in apps/api/.env');
    const url = new URL(line.slice('DATABASE_URL='.length).trim());
    url.pathname = `${url.pathname.replace(/^\//, '')}_test`;
    raw = url.toString();
  }

  // The e2e setup wipes this database. Refuse anything that isn't clearly a test database.
  const dbName = new URL(raw).pathname.replace(/^\//, '');
  if (!dbName.endsWith('_test')) {
    throw new Error(`Refusing to use database "${dbName}" for tests: name must end with "_test"`);
  }
  return raw;
}
