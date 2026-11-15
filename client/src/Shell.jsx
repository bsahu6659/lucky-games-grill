import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ReceiptText, Users, CalendarClock, Crown, Trophy, Wallet, LineChart, CalendarRange, Activity as ActivityIcon,
  Gauge, Cookie, Tags, Monitor, UtensilsCrossed, UserCog, Store, QrCode, LifeBuoy, LogOut, Menu as MenuIcon, Sun, Moon, KeyRound,
} from 'lucide-react';
import { useAuth, useTheme, useToast } from './state.jsx';
import { Modal, Field } from './ui.jsx';
import { post } from './api.js';

const NAV = [
  { group: 'Counter' },
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/invoices', label: 'Invoices', icon: ReceiptText, perm: 'billing' },
  { to: '/customers', label: 'Customers', icon: Users, perm: 'customers' },
  { to: '/bookings', label: 'Bookings', icon: CalendarClock, perm: 'bookings' },
  { group: 'Business' },
  { to: '/memberships', label: 'Memberships & Rewards', icon: Crown, perm: 'memberships' },
  { to: '/tournaments', label: 'Tournaments', icon: Trophy, perm: 'tournaments' },
  { to: '/expenses', label: 'Expenses & Income', icon: Wallet, perm: 'expenses' },
  { group: 'Reports', perm: 'reports' },
  { to: '/reports/daily', label: 'Daily Revenue', icon: LineChart, perm: 'reports' },
  { to: '/reports/monthly', label: 'Monthly Revenue', icon: CalendarRange, perm: 'reports' },
  { to: '/reports/usage', label: 'System Usage', icon: Gauge, perm: 'reports' },
  { to: '/reports/snacks', label: 'Snacks & Stock', icon: Cookie, perm: 'reports' },
  { to: '/reports/activity', label: 'Activity Timeline', icon: ActivityIcon, perm: 'reports' },
  { group: 'Shop Setup', perm: 'setup' },
  { to: '/setup/rates', label: 'Rate Card', icon: Tags, perm: 'setup' },
  { to: '/setup/stations', label: 'Stations', icon: Monitor, perm: 'setup' },
  { to: '/setup/menu', label: 'Snacks & Grill Menu', icon: UtensilsCrossed, perm: 'setup' },
  { to: '/setup/integrations', label: 'Live View & Devices', icon: QrCode, perm: 'setup' },
  { to: '/setup/staff', label: 'Manage Staff', icon: UserCog, admin: true },
  { to: '/setup/shop', label: 'Shop Details & Tax', icon: Store, admin: true },
  { group: 'Support' },
  { to: '/help', label: 'Help & Guide', icon: LifeBuoy },
];

export default function Shell({ children }) {
  const { user, shop, logout, can, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState(false);
  const [theme, toggle] = useTheme();
  const loc = useLocation();
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [loc.pathname]);

  const ok = (x) => (x.admin ? isAdmin : !x.perm || can(x.perm));
  const items = NAV.filter(ok).filter((x, i, arr) => !x.group || (arr[i + 1] && !arr[i + 1].group));
  const initials = (user?.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="shell">
      <aside className={`side ${open ? 'open' : ''}`} aria-label="Main menu">
        <div className="brandbar">
          <img src="/logo-256.webp" alt="" width="44" height="44" />
          <div><div className="t1 brand-text">LUCKY</div><div className="t2">Games &amp; Grill</div></div>
        </div>
        {items.map((x, i) => x.group
          ? <div key={'g' + i} className="navgrp">{x.group}</div>
          : <NavLink key={x.to} to={x.to} end={x.end} className="navlink"><x.icon />{x.label}</NavLink>)}
        <div className="me">
          <div className="row">
            <div className="avatar">{initials}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="b" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name}</div>
              <div className="tiny mute">{isAdmin ? 'Owner · Admin' : 'Staff'} · @{user?.username}</div>
            </div>
          </div>
          <div className="row mt12" style={{ gap: 6 }}>
            <button className="btn btn-sm btn-icon" onClick={toggle} title="Switch theme" aria-label="Switch theme">{theme === 'dark' ? <Sun /> : <Moon />}</button>
            <button className="btn btn-sm btn-icon" onClick={() => setPw(true)} title="Change password" aria-label="Change password"><KeyRound /></button>
            <button className="btn btn-sm sp" onClick={logout}><LogOut />Logout</button>
          </div>
        </div>
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <div className="main">
        <header className="topbar">
          <button className="btn btn-icon btn-ghost" onClick={() => setOpen(true)} aria-label="Open menu"><MenuIcon /></button>
          <img src="/logo-256.webp" alt="" width="34" height="34" />
          <b className="sp" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{shop?.shopName || 'Lucky Games & Grill'}</b>
          <button className="btn btn-icon btn-ghost" onClick={toggle} aria-label="Switch theme">{theme === 'dark' ? <Sun /> : <Moon />}</button>
        </header>
        <main className="content">{children}</main>
      </div>
      {pw && <PasswordModal onClose={() => setPw(false)} />}
    </div>
  );
}

function PasswordModal({ onClose }) {
  const toast = useToast();
  const [f, setF] = useState({ current: '', next: '', again: '' });
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    if (f.next !== f.again) return toast('New passwords do not match', 'bad');
    setBusy(true);
    try { await post('/auth/password', { current: f.current, next: f.next }); toast('Password changed'); onClose(); } catch (err) { toast(err.message, 'bad'); }
    setBusy(false);
  };
  return (
    <Modal title="Change password" icon={KeyRound} size="narrow" onClose={onClose}>
      <form className="col gap12" onSubmit={save}>
        <Field label="Current password"><input className="input" type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} required /></Field>
        <Field label="New password" hint="min 6 characters"><input className="input" type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} required minLength={6} /></Field>
        <Field label="New password again"><input className="input" type="password" autoComplete="new-password" value={f.again} onChange={(e) => setF({ ...f, again: e.target.value })} required /></Field>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
      </form>
    </Modal>
  );
}
