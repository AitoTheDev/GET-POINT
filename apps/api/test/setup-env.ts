import { testDatabaseUrl } from './test-db';

// process.env wins over apps/api/.env in ConfigModule, so this points the app at the test DB.
process.env.DATABASE_URL = testDatabaseUrl();
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'e2e-test-secret-that-is-long-enough-1234567890';
process.env.SMTP_HOST = '';
