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
}

/** Thin fetch wrapper. All requests go through the Vite /api proxy in dev. */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiRequestError(0, null, 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (body as Partial<ApiError> | null)?.message ?? res.statusText;
    throw new ApiRequestError(res.status, body, message);
  }
  return body as T;
}
