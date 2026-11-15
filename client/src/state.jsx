import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { api, setToken, getToken, setUnauthorizedHandler, subscribe, closeLive } from './api.js';

/* ================= auth ================= */
const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: !!getToken(), user: null, shop: null });

  const logout = useCallback(() => { setToken(''); closeLive(); setState({ loading: false, user: null, shop: null }); }, []);
  useEffect(() => { setUnauthorizedHandler(logout); }, [logout]);

  useEffect(() => {
    if (!getToken()) return;
    api('/auth/me').then((d) => setState({ loading: false, user: d.user, shop: d.shop })).catch(() => logout());
  }, [logout]);

  const login = useCallback(async (username, password) => {
    const d = await api('/auth/login', { method: 'POST', body: { username, password } });
    setToken(d.token);
    const me = await api('/auth/me');
    setState({ loading: false, user: me.user, shop: me.shop });
    return me.user;
  }, []);

  const value = useMemo(() => {
    const u = state.user;
    const can = (perm) => !!u && (u.role === 'admin' || u.permissions?.includes(perm));
    return { ...state, login, logout, can, isAdmin: u?.role === 'admin', setShop: (shop) => setState((s) => ({ ...s, shop })) };
  }, [state, login, logout]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

/* ================= toasts ================= */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
const ICON = { ok: CheckCircle2, bad: XCircle, warn: AlertTriangle };

export function ToastProvider({ children }) {
  const [list, setList] = useState([]);
  const push = useCallback((msg, kind = 'ok', ms = 2800) => {
    const id = Math.random().toString(36).slice(2);
    setList((l) => [...l.slice(-3), { id, msg, kind }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), ms);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {list.map((t) => { const I = ICON[t.kind] || CheckCircle2; return <div key={t.id} className={`toast ${t.kind}`}><I />{t.msg}</div>; })}
      </div>
    </ToastCtx.Provider>
  );
}

/* ================= live data hooks ================= */
/** Re-run `fn` whenever the server says one of `topics` changed (debounced). */
export function useLive(topics, fn) {
  const ref = useRef(fn); ref.current = fn;
  const key = topics.join(',');
  useEffect(() => {
    let t = null;
    const want = key.split(',');
    const off = subscribe((changed) => {
      if (!changed.some((c) => want.includes(c))) return;
      clearTimeout(t);
      t = setTimeout(() => ref.current(), 120);
    });
    const onFocus = () => document.visibilityState === 'visible' && ref.current();
    document.addEventListener('visibilitychange', onFocus);
    return () => { off(); clearTimeout(t); document.removeEventListener('visibilitychange', onFocus); };
  }, [key]);
}

/** Load data from the API with loading / error state + reload(). */
export function useFetch(path, deps = [], { live } = {}) {
  const [s, setS] = useState({ data: null, loading: true, error: null });
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!path) return;
    const my = ++seq.current;
    try {
      const data = await api(path);
      if (my === seq.current) setS({ data, loading: false, error: null });
    } catch (e) {
      if (my === seq.current) setS((p) => ({ ...p, loading: false, error: e.message }));
    }
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setS((p) => ({ ...p, loading: true })); load(); }, [load, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  useLive(live || [], load);
  return { ...s, reload: load, setData: (fn) => setS((p) => ({ ...p, data: typeof fn === 'function' ? fn(p.data) : fn })) };
}

/* ================= one shared 1-second clock ================= */
let now = Date.now();
const subs = new Set();
let iv = null;
function tickSub(cb) {
  subs.add(cb);
  if (!iv) iv = setInterval(() => { now = Date.now(); subs.forEach((f) => f()); }, 1000);
  return () => { subs.delete(cb); if (!subs.size) { clearInterval(iv); iv = null; } };
}
/** Current time, re-rendering only the component that uses it once per second. */
export const useNow = () => useSyncExternalStore(tickSub, () => now);

/* ================= theme ================= */
export function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark');
  const toggle = useCallback(() => {
    const t = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#0a0a0d' : '#f6f4ef');
    try { localStorage.setItem('lgg-theme', t); } catch { /* ignore */ }
    setTheme(t);
  }, [theme]);
  return [theme, toggle];
}
