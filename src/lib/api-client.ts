export async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  let body: unknown = null;
  try { body = await response.json(); } catch { /* empty response */ }
  if (response.status === 401) {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
  }
  if (!response.ok) {
    const error = body && typeof body === 'object' && 'error' in body ? (body as { error?: { message?: string } }).error : undefined;
    throw new Error(error?.message ?? '通信に失敗しました。時間をおいて再試行してください。');
  }
  return body as T;
}

export function jsonBody(value: unknown): RequestInit { return { method: 'POST', body: JSON.stringify(value) }; }
