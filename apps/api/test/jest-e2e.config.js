/** E2E tests: real NestJS app + real PostgreSQL test database (see test-db.ts). */
module.exports = {
  rootDir: '..',
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: { '^.+\\.ts$': 'ts-jest' },
  testEnvironment: 'node',
  globalSetup: '<rootDir>/test/global-setup.ts',
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  // Test files share one database, so run them one at a time.
  maxWorkers: 1,
  testTimeout: 30000,
};
