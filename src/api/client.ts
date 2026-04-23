const BASE_URL = '/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (body?.detail) {
        message = Array.isArray(body.detail)
          ? body.detail.map((d: { msg: string }) => d.msg).join(', ')
          : String(body.detail);
      }
    } catch {
      // ignore parse error, keep generic message
    }
    throw new ApiError(response.status, message);
  }

  return response.json() as Promise<T>;
}

export const get = <T>(path: string, token?: string) =>
  request<T>(path, { method: 'GET' }, token);

export const post = <T>(path: string, body: unknown, token?: string) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) }, token);

export const patch = <T>(path: string, body: unknown, token?: string) =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }, token);
