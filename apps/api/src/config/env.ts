import { z } from 'zod';

const optional = z
  .string()
  .optional()
  .transform((value) => (value ? value : undefined));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  /**
   * Reverse proxies in front of the API (e.g. 1 behind nginx/a load balancer), so the client IP
   * used for rate limits and the audit log is the real one. 0 = the API is reached directly.
   */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  DATABASE_URL: z.string().url(),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173,http://localhost:5174')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),

  // ---- Auth ----
  JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
  /** Access-token lifetime in minutes. */
  JWT_ACCESS_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  /** Refresh session lifetime without "remember me" (hours). */
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),
  /** Refresh session lifetime with "remember me" (days). */
  REMEMBER_ME_TTL_DAYS: z.coerce.number().int().positive().default(30),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(30),

  /** Public URL of the CMS, used to build password-reset links in emails. */
  CMS_URL: z.string().url().default('http://localhost:5173'),

  // ---- Email (optional; without SMTP_HOST, dev prints emails to the console) ----
  SMTP_HOST: optional,
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  SMTP_USER: optional,
  SMTP_PASS: optional,
  SMTP_FROM: z.string().default('GET POINT <no-reply@getpoint.local>'),

  /** Folder for uploaded receipt files (relative to apps/api, or absolute). */
  RECEIPT_STORAGE_DIR: z.string().min(1).default('storage/receipts'),

  // ---- LOGA (points system). "mock" = built-in fake LOGA, no credentials needed ----
  LOGA_MODE: z.enum(['mock', 'live']).default('mock'),
  LOGA_BASE_URL: z.string().url().default('https://loga.app/api'),
  LOGA_USERNAME: optional,
  LOGA_PASSWORD: optional,
  /** LOGA "uuid": any fixed device name; the login token is tied to it. */
  LOGA_DEVICE_ID: z.string().min(1).default('GETPOINT-API'),
  LOGA_CARD_ID: optional,
  LOGA_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

  // ---- LINE (member app). "mock" = development login without LINE; refused in production ----
  LINE_MODE: z.enum(['mock', 'live']).default('mock'),
  /** LINE Login channel ID: the "audience" of the LIFF ID tokens we accept. */
  LINE_CHANNEL_ID: optional,
  /** LIFF app ID (from the LINE Developers console), sent to the member app. */
  LIFF_ID: optional,
  /** Member-app session length (minutes); the app logs in again silently afterwards. */
  LIFF_SESSION_MINUTES: z.coerce.number().int().positive().default(120),

  // ---- SMS for phone codes (only used when "verify phone by SMS" is on in Settings) ----
  /** mock = codes are printed in the API console (development only). */
  SMS_PROVIDER: z.enum(['mock']).default('mock'),
});

const LIVE_LOGA_KEYS = ['LOGA_USERNAME', 'LOGA_PASSWORD', 'LOGA_CARD_ID'] as const;

export type Env = z.infer<typeof envSchema>;

/** Used by ConfigModule: fail fast at boot with a readable list of bad/missing variables. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema
    .superRefine((env, ctx) => {
      if (env.LOGA_MODE === 'live') {
        for (const key of LIVE_LOGA_KEYS) {
          if (!env[key]) {
            ctx.addIssue({ code: 'custom', path: [key], message: 'required when LOGA_MODE=live' });
          }
        }
      }
      if (env.LINE_MODE === 'live') {
        for (const key of ['LINE_CHANNEL_ID', 'LIFF_ID'] as const) {
          if (!env[key]) {
            ctx.addIssue({ code: 'custom', path: [key], message: 'required when LINE_MODE=live' });
          }
        }
      } else if (env.NODE_ENV === 'production') {
        // The mock login lets anyone act as any LINE user.
        ctx.addIssue({
          code: 'custom',
          path: ['LINE_MODE'],
          message: 'must be live in production',
        });
      }
      if (env.NODE_ENV === 'production') {
        if (env.LOGA_MODE !== 'live') {
          // Points would only be "sent" to an in-memory fake and lost.
          ctx.addIssue({
            code: 'custom',
            path: ['LOGA_MODE'],
            message: 'must be live in production',
          });
        }
        if (/CHANGE_ME/i.test(env.JWT_ACCESS_SECRET)) {
          ctx.addIssue({
            code: 'custom',
            path: ['JWT_ACCESS_SECRET'],
            message: 'still the example value; generate a random secret',
          });
        }
      }
    })
    .safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
