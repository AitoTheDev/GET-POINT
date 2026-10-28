import type { AuthUser } from '@getpoint/shared';

/** Error body returned by the API (see apps/api/src/common/http-exception.filter.ts). */
export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
  details?: string[];
}

export class ApiRequestError extends Error {
  constructor(
    /** HTTP status; 0 when the server could not be reached. */
    public readonly status: number,
    /** Parsed JSON body. Usually an ApiError, but some endpoints (e.g. /health) send their own shape. */
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
  }

  /** Field-level validation messages, if any. */
  get details(): string[] {
    return (this.body as Partial<ApiError> | null)?.details ?? [];
  }
}

export interface SessionResponse {
  accessToken: string;
  user: AuthUser;
}

// The access token lives only in memory; the refresh token is an httpOnly cookie the
// browser sends to /api/auth/* automatically.
let accessToken: string | null = null;
let onSessionLost: (() => void) | null = null;
let refreshInFlight: Promise<SessionResponse | null> | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

/** Called when the session cannot be renewed (AuthProvider switches to the login page). */
export const setOnSessionLost = (handler: (() => void) | null) => {
  onSessionLost = handler;
};

/** Renew the access token from the refresh cookie. Concurrent callers share one request. */
export function refreshSession(): Promise<SessionResponse | null> {
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' });
      if (!res.ok) return null;
      const session = (await res.json()) as SessionResponse;
      accessToken = session.accessToken;
      return session;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function send(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`/api${path}`, {
      ...init,
      credentials: 'same-origin',
      headers: {
        ...(init?.body !== undefined && { 'Content-Type': 'application/json' }),
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiRequestError(0, null, 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
  }
}

/** Fetch wrapper: adds the access token and retries once after renewing an expired session. */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res = await send(path, init);

  if (res.status === 401 && accessToken && !path.startsWith('/auth/')) {
    const renewed = await refreshSession();
    if (renewed) {
      res = await send(path, init);
    } else {
      accessToken = null;
      onSessionLost?.();
    }
  }

  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const message = (body as Partial<ApiError> | null)?.message ?? res.statusText;
    throw new ApiRequestError(res.status, body, message);
  }
  return body as T;
}

export const apiGet = <T>(path: string) => apiFetch<T>(path);

export const apiSend = <T>(
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
) => apiFetch<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

/** Human-readable message for an error from apiFetch (falls back to a generic Thai message). */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) {
    return err.details.length ? err.details.join('\n') : err.message;
  }
  return 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
}
