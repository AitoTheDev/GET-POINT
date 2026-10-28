import liff from '@line/liff';
import type { LiffConfig } from './api';

/** Development login (LINE_MODE=mock): a pretend LINE user kept in this browser. */
export interface MockLineUser {
  lineUserId: string;
  displayName: string;
}

const MOCK_KEY = 'gp-mock-line-user';

export function getMockUser(): MockLineUser | null {
  try {
    const raw = localStorage.getItem(MOCK_KEY);
    return raw ? (JSON.parse(raw) as MockLineUser) : null;
  } catch {
    return null;
  }
}

export function setMockUser(user: MockLineUser | null) {
  try {
    if (user) localStorage.setItem(MOCK_KEY, JSON.stringify(user));
    else localStorage.removeItem(MOCK_KEY);
  } catch {
    // Storage blocked: the mock user lasts until the page reloads.
  }
}

/** A random pretend LINE user ID ("U" + 32 hex, like real ones). */
export const randomLineUserId = () =>
  `U${Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}`;

let initialized = false;

/**
 * Start the LIFF SDK (live mode). Must finish before the router reads the URL: a rich-menu
 * link like https://liff.line.me/<id>/scan arrives as "?liff.state=/scan" and the SDK then
 * moves to /scan.
 */
export async function initLine(config: LiffConfig) {
  if (config.lineMode !== 'live' || initialized) return;
  await liff.init({ liffId: config.liffId! });
  initialized = true;
}

/**
 * An ID token proving who the LINE user is, or null when the development login form must be
 * shown first. In live mode this may leave the page to sign in with LINE.
 */
export function getIdToken(config: LiffConfig): string | null {
  if (config.lineMode === 'mock') {
    const user = getMockUser();
    return user ? `mock:${user.lineUserId}:${user.displayName}` : null;
  }
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: window.location.href });
    return null;
  }
  return liff.getIDToken();
}

/** Close the LIFF window inside LINE (in a normal browser: go to the home page). */
export function closeApp(config: LiffConfig | undefined) {
  if (config?.lineMode === 'live' && liff.isInClient()) liff.closeWindow();
  else window.location.assign('/');
}
