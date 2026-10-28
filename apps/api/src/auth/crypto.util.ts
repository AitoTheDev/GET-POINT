import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomInt } from 'node:crypto';

const BCRYPT_COST = 12;

export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_COST);

export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

/**
 * Compared against when the email does not exist, so a failed login takes the same time
 * whether or not the account exists.
 */
export const DUMMY_PASSWORD_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST);

/** Opaque token for refresh sessions and reset links (sent to the client, never stored). */
export const generateToken = () => randomBytes(32).toString('base64url');

/** What is stored in the database instead of the token itself. */
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

// No look-alike characters (0/O, 1/l/I) so temporary passwords can be read out loud.
const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** 12-character temporary password given to a user after an admin reset or account creation. */
export function generateTemporaryPassword(length = 12): string {
  let out = '';
  for (let i = 0; i < length; i++) out += TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)];
  return out;
}
