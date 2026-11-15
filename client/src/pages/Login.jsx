import { useState } from 'react';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { useAuth } from '../state.jsx';

export default function Login() {
  const { login } = useAuth();
  const [f, setF] = useState({ username: '', password: '' });
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try { await login(f.username.trim(), f.password); } catch (x) { setErr(x.message); setBusy(false); }
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit} style={{ marginTop: 70 }}>
        <img className="logo" src="/logo-256.webp" alt="Lucky Games & Grill" width="116" height="116" />
        <div className="center mb16">
          <h1 className="brand-text" style={{ fontSize: 26, fontWeight: 900, letterSpacing: '.02em' }}>LUCKY GAMES &amp; GRILL</h1>
          <div className="mute mt8">Counter, billing &amp; lounge management</div>
        </div>
        <div className="col gap12">
          <label className="field"><span>Login ID</span>
            <input className="input" autoFocus autoComplete="username" autoCapitalize="none" spellCheck="false" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} placeholder="e.g. admin" required />
          </label>
          <label className="field"><span>Password</span>
            <div className="pw">
              <input className="input" type={show ? 'text' : 'password'} autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required style={{ paddingRight: 46 }} />
              <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff /> : <Eye />}</button>
            </div>
          </label>
          {err && <div className="badge bad" style={{ height: 'auto', padding: '8px 12px', borderRadius: 10, whiteSpace: 'normal' }}>{err}</div>}
          <button className="btn btn-primary btn-lg btn-block" disabled={busy}><LogIn />{busy ? 'Signing in…' : 'Login'}</button>
        </div>
        <div className="center small faint mt16">Owner and staff use the same screen — the menu changes by role.</div>
      </form>
    </div>
  );
}
