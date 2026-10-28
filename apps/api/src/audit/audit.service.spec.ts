import { redact } from './audit.service';

describe('redact', () => {
  it('hides sensitive keys at any depth', () => {
    expect(
      redact({
        email: 'a@b.c',
        password: 'secret1',
        nested: { newPassword: 'x', refreshToken: 'y', name: 'ok' },
        list: [{ apiSecret: 'z' }],
      }),
    ).toEqual({
      email: 'a@b.c',
      password: '[REDACTED]',
      nested: { newPassword: '[REDACTED]', refreshToken: '[REDACTED]', name: 'ok' },
      list: [{ apiSecret: '[REDACTED]' }],
    });
  });

  it('leaves primitives alone', () => {
    expect(redact('text')).toBe('text');
    expect(redact(5)).toBe(5);
    expect(redact(null)).toBeNull();
  });
});
