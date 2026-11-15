const KEY = 'lgg-token';
let token = (() => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } })();
let onUnauthorized = () => {};

export const getToken = () => token;
export function setToken(t) {
  token = t || '';
  try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { /* private mode */ }
}
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function api(path, { method = 'GET', body, signal } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method, signal,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError(0, 'Network error — check the connection');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) { setToken(''); onUnauthorized(); }
  if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (${res.status})`);
  return data;
}

export const get = (p, o) => api(p, o);
export const post = (p, body) => api(p, { method: 'POST', body: body ?? {} });
export const put = (p, body) => api(p, { method: 'PUT', body: body ?? {} });
export const patch = (p, body) => api(p, { method: 'PATCH', body: body ?? {} });
export const del = (p) => api(p, { method: 'DELETE' });

/* ---------- live updates (one shared EventSource) ---------- */
const listeners = new Set();
let es = null;
export function subscribe(fn) {
  listeners.add(fn);
  if (!es && token) {
    es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
    es.addEventListener('changed', (e) => {
      let topics = [];
      try { topics = JSON.parse(e.data).topics || []; } catch { /* ignore */ }
      listeners.forEach((l) => l(topics));
    });
    es.onerror = () => { if (!token) closeLive(); };
  }
  return () => { listeners.delete(fn); if (!listeners.size) closeLive(); };
}
export function closeLive() { es?.close(); es = null; }
