import { describe, expect, it } from 'vitest';
import { formatThaiMobile, maskThaiMobile, memberFullName, normalizeThaiMobile } from './members';

describe('normalizeThaiMobile', () => {
  it.each([
    ['0812345678', '0812345678'],
    ['081-234-5678', '0812345678'],
    [' 081 234 5678 ', '0812345678'],
    ['+66812345678', '0812345678'],
    ['+66 81 234 5678', '0812345678'],
    ['66912345678', '0912345678'],
    ['0612345678', '0612345678'],
  ])('accepts %s', (input, expected) => {
    expect(normalizeThaiMobile(input)).toBe(expected);
  });

  it.each([
    '021234567', // Bangkok landline
    '0212345678',
    '0712345678',
    '081234567', // 9 digits
    '08123456789', // 11 digits
    '+1812345678',
    'abc',
    '',
  ])('rejects %s', (input) => {
    expect(normalizeThaiMobile(input)).toBeNull();
  });
});

describe('phone display', () => {
  it('formats and masks a mobile number', () => {
    expect(formatThaiMobile('0812345678')).toBe('081-234-5678');
    expect(maskThaiMobile('0812341234')).toBe('08X-XXX-1234');
  });
});

describe('memberFullName', () => {
  it('joins first and last name', () => {
    expect(memberFullName({ firstName: 'สมชาย', lastName: 'ใจดี' })).toBe('สมชาย ใจดี');
    expect(memberFullName({ firstName: 'สมชาย', lastName: null })).toBe('สมชาย');
  });
});
