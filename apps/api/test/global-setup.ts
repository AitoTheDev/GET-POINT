import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { testDatabaseUrl } from './test-db';

/**
 * Bring the test database up to date before the e2e suite runs.
 * `migrate deploy` creates the database if missing and only applies new migrations;
 * each test file empties the tables it needs (see helpers.resetData).
 */
export default function globalSetup() {
  execSync('npx prisma migrate deploy', {
    cwd: join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
    stdio: 'pipe',
  });
}
