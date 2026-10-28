import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { testDatabaseUrl } from './test-db';

// process.env wins over apps/api/.env in ConfigModule, so this points the app at the test DB.
process.env.DATABASE_URL = testDatabaseUrl();
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'e2e-test-secret-that-is-long-enough-1234567890';
process.env.SMTP_HOST = '';
// Receipt files from e2e tests go to a throw-away folder, never the dev storage.
process.env.RECEIPT_STORAGE_DIR = join(tmpdir(), 'getpoint-e2e-receipts');

// Automated tests send points to LOGA explicitly.
process.env.TRANSFER_AUTO_SEND = 'false';
