import { validateEnv } from './env';

describe('validateEnv', () => {
  const base = {
    DATABASE_URL: 'postgresql://u:p@localhost:5432/getpoint',
    JWT_ACCESS_SECRET: 'x'.repeat(32),
  };

  it('applies defaults and splits CORS origins', () => {
    const env = validateEnv({ ...base, CORS_ORIGINS: 'http://a.test, http://b.test' });
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
    expect(env.JWT_ACCESS_TTL_MINUTES).toBe(15);
    expect(env.SMTP_HOST).toBeUndefined();
  });

  it('fails fast when DATABASE_URL is missing', () => {
    expect(() => validateEnv({ JWT_ACCESS_SECRET: base.JWT_ACCESS_SECRET })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('rejects a short JWT secret', () => {
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('treats an empty SMTP_HOST as not configured', () => {
    expect(validateEnv({ ...base, SMTP_HOST: '' }).SMTP_HOST).toBeUndefined();
  });
});
