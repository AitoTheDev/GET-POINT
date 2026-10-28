import type { MemberStatus, ReceiptStatus } from '@getpoint/shared';

export interface LiffConfig {
  lineMode: 'mock' | 'live';
  liffId: string | null;
  verifyPhone: boolean;
  uploadLimits: { maxFileMb: number; maxFiles: number };
  supportContact: { phone: string | null; lineId: string | null };
  communities: { id: string; name: string }[];
}

/** The member as the app sees it (no stored name: the app greets with the LINE name). */
export interface MemberView {
  code: string;
  phone: string;
  community: { id: string; name: string };
  status: MemberStatus;
  logaLinked: boolean;
}

export interface MyReceipt {
  code: string;
  status: Exclude<ReceiptStatus, 'NEEDS_CHECK'>;
  submittedAt: string;
  shop: string | null;
  amount: number | null;
  points: number | null;
  pointsAdded: boolean;
  rejectMessage: string | null;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** Machine-readable reason from the API, e.g. NOT_REGISTERED, CODE_WRONG. */
    public readonly code?: string,
  ) {
    super(message);
  }
}

// Member-app token from POST /liff/session (kept for this tab only).
const TOKEN_KEY = 'gp-liff-token';
let token: string | null = readToken();
let onLoginLost: (() => void) | null = null;

function readToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(value: string | null) {
  token = value;
  try {
    if (value) sessionStorage.setItem(TOKEN_KEY, value);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage blocked: the token simply lives in memory.
  }
}

export const hasToken = () => Boolean(token);

/** Called when the API says the sign-in expired (the app signs in with LINE again). */
export const setOnLoginLost = (handler: (() => void) | null) => {
  onLoginLost = handler;
};

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/liff${path}`, {
      ...init,
      headers: {
        ...(typeof init?.body === 'string' && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'เชื่อมต่อไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');
  }
  const body = (await res.json().catch(() => null)) as {
    message?: string;
    code?: string;
    details?: string[];
  } | null;
  if (!res.ok) {
    if (res.status === 401 && body?.code === 'LIFF_LOGIN') {
      setToken(null);
      onLoginLost?.();
    }
    const message =
      body?.details?.join('\n') ||
      body?.message ||
      (res.status === 413 ? 'ไฟล์ใหญ่เกินกำหนด' : 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    throw new ApiError(res.status, message, body?.code);
  }
  return body as T;
}

export const post = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const errorText = (err: unknown) =>
  err instanceof ApiError ? err.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
