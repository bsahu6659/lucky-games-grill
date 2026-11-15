import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Inbox, Search } from 'lucide-react';
import { get } from './api.js';

/* ---------------- formatting ---------------- */
const TZ = 'Asia/Kolkata';
const inrFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
export const inr = (n) => { const v = Math.round((Number(n) || 0) * 100) / 100; return `${v < 0 ? '−' : ''}₹${inrFmt.format(Math.abs(v))}`; };
const tFmt = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: true });
const dFmt = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' });
const dtFmt = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
export const fTime = (d) => (d ? tFmt.format(new Date(d)) : '—');
export const fDate = (d) => (d ? dFmt.format(new Date(d)) : '—');
export const fDateTime = (d) => (d ? dtFmt.format(new Date(d)) : '—');
const keyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
export const todayKey = () => keyFmt.format(new Date());
export const dayLabel = (k) => fDate(`${k}T12:00:00+05:30`);
export const mins = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`);
export const MODE_LABEL = { cash: 'Cash', online: 'Online / UPI', split: 'Split', credit: 'Credit (pay later)', wallet: 'Wallet' };

/* ---------------- small pieces ---------------- */
export function PageHead({ title, sub, children }) {
  return (
    <div className="pagehead">
      <div><h1>{title}</h1>{sub && <div className="sub">{sub}</div>}</div>
      <div className="sp" />
      {children && <div className="row wrap">{children}</div>}
    </div>
  );
}
export const Empty = ({ icon: I = Inbox, title, children }) => (
  <div className="empty"><I /><div className="b" style={{ color: 'var(--ink)' }}>{title}</div>{children && <div className="small mt8">{children}</div>}</div>
);
export const Spinner = ({ center }) => (center ? <div className="row" style={{ justifyContent: 'center', padding: 40 }}><div className="spin" /></div> : <div className="spin" />);
export const Field = ({ label, hint, children, style }) => <label className="field" style={style}><span>{label}{hint && <> · <span className="hint">{hint}</span></>}</span>{children}</label>;
export const Switch = ({ checked, onChange, label }) => (
  <label className="check"><span className="switch"><input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} /><i /></span>{label}</label>
);
export const Stepper = ({ value, onChange, min = 0, disabled }) => (
  <span className="stepper">
    <button type="button" aria-label="less" disabled={disabled || value <= min} onClick={() => onChange(value - 1)}>−</button>
    <b>{value}</b>
    <button type="button" aria-label="more" disabled={disabled} onClick={() => onChange(value + 1)}>+</button>
  </span>
);
export function Seg({ value, options, onChange }) {
  return <div className="seg">{options.map(([v, l]) => <button key={v} type="button" className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>)}</div>;
}

/* ---------------- modal ---------------- */
export function Modal({ title, icon: I, onClose, children, footer, size = '', className = '' }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, [onClose]);
  return createPortal(
    <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${size} ${className}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="modal-h">{I && <I size={20} color="var(--orange)" />}<h2 style={{ flex: 1 }}>{title}</h2>
          {onClose && <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close"><X /></button>}</div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ---------------- confirm dialog (promise based) ---------------- */
const ConfirmCtx = createContext(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);
export function ConfirmProvider({ children }) {
  const [q, setQ] = useState(null);
  const ask = useCallback((opts) => new Promise((resolve) => setQ({ ...(typeof opts === 'string' ? { message: opts } : opts), resolve })), []);
  const close = (v) => { q?.resolve(v); setQ(null); };
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      {q && (
        <Modal title={q.title || 'Are you sure?'} size="narrow" onClose={() => close(false)}
          footer={<><button className="btn" onClick={() => close(false)}>Cancel</button>
            <button className={`btn ${q.danger ? 'btn-danger' : 'btn-primary'}`} autoFocus onClick={() => close(true)}>{q.ok || 'Yes, continue'}</button></>}>
          <p className="mute" style={{ margin: 0 }}>{q.message}</p>
        </Modal>
      )}
    </ConfirmCtx.Provider>
  );
}

/* ---------------- customer autosuggest (phone or name) ---------------- */
export function CustomerInput({ phone, name, onChange, compact }) {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const timer = useRef(null);
  const lookup = (q) => {
    clearTimeout(timer.current);
    if (!q || q.length < 2) { setList([]); return; }
    timer.current = setTimeout(() => get(`/customers/lookup?q=${encodeURIComponent(q)}`).then((l) => { setList(l); setHi(0); setOpen(true); }).catch(() => {}), 180);
  };
  const choose = (c) => { onChange({ phone: c.phone, name: c.name, customer: c }); setOpen(false); setList([]); };
  const keys = (e) => {
    if (!open || !list.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(list.length - 1, h + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    if (e.key === 'Enter') { e.preventDefault(); choose(list[hi]); }
    if (e.key === 'Escape') setOpen(false);
  };
  const cls = `input${compact ? ' input-sm' : ''}`;
  return (
    <div className={compact ? 'grid2' : 'col'} style={{ gap: 8 }}>
      <div style={{ position: 'relative' }}>
        <input className={cls} inputMode="numeric" placeholder="Phone (10 digit)" value={phone} maxLength={10} onKeyDown={keys}
          onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); onChange({ phone: v, name, customer: null }); lookup(v); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)} onFocus={() => list.length && setOpen(true)} />
        {open && list.length > 0 && (
          <div className="suggest">
            {list.map((c, i) => <button type="button" key={c._id} className={i === hi ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); choose(c); }}>
              <span><b>{c.name}</b> <span className="mute small">{c.phone}</span></span>
              <span className="small mute">{c.walletBalance > 0 ? `Wallet ${inr(c.walletBalance)}` : c.loyaltyPoints ? `${c.loyaltyPoints} pts` : ''}</span>
            </button>)}
          </div>
        )}
      </div>
      <div style={{ position: 'relative' }}>
        <input className={cls} placeholder="Customer name" value={name} onKeyDown={keys}
          onChange={(e) => { onChange({ phone, name: e.target.value, customer: null }); if (!phone) lookup(e.target.value); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)} />
      </div>
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Search…', style }) {
  return (
    <div style={{ position: 'relative', ...style }}>
      <Search size={16} style={{ position: 'absolute', left: 11, top: 12, color: 'var(--faint)' }} />
      <input className="input" style={{ paddingLeft: 34 }} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** Tiny CSV export helper (opens in Excel). */
export function downloadCSV(name, rows) {
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };
  const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
