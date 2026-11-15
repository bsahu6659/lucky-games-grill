import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { elapsedMs, sessionCharge, hms } from '@shared/pricing.js';
import { api } from '../api.js';
import { useNow } from '../state.jsx';
import { inr, fTime, Spinner } from '../ui.jsx';

/** Public page a customer opens by scanning the QR on their seat. */
export default function LiveView() {
  const { token } = useParams();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [offset, setOffset] = useState(0);
  const load = useCallback(() => api(`/public/live/${token}`).then((x) => { setOffset(x.serverNow - Date.now()); setD(x); setErr(''); }).catch((e) => setErr(e.message)), [token]);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
  const now = useNow() + offset;

  if (err && !d) return <div className="live"><div className="live-card card"><h2>Link not valid</h2><p className="mute mt8">Please scan the QR on your seat again or ask the counter.</p></div></div>;
  if (!d) return <div className="live"><Spinner /></div>;
  const ms = elapsedMs(d, now);
  const c = d.state && d.state !== 'idle' ? sessionCharge({ ms, players: d.players, snacks: d.snacks, type: { rates: d.rates, blockMinutes: d.blockMinutes }, settings: { graceMinutes: d.graceMinutes, bonus: d.bonus } }) : null;
  const left = d.stopAtMinutes ? d.stopAtMinutes * 60000 - ms : null;
  return (
    <div className="live">
      <div className="live-card">
        <img src="/logo-256.webp" alt="" width="92" height="92" style={{ borderRadius: '50%', boxShadow: 'var(--glow)' }} />
        <h2 className="mt12 brand-text" style={{ fontSize: 22, fontWeight: 900 }}>{d.shopName}</h2>
        <div className="mute">{d.station} · {d.type}</div>
        <div className="card mt16 col" style={{ gap: 6 }}>
          {d.state === 'idle' ? <><div className="tm faint">00:00:00</div><div className="mute">This seat is free. Ask the counter to start your session.</div></> : <>
            {d.firstName && <div className="mute">Hi {d.firstName} 👋</div>}
            <div className="tm">{hms(ms)}</div>
            <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
              <span className={`badge ${d.state === 'running' ? 'ok' : d.state === 'paused' ? 'warn' : 'brand'}`}>{d.state === 'running' ? 'Playing' : d.state === 'paused' ? 'Paused' : 'Finished — pay at counter'}</span>
              <span className="badge">Started {fTime(d.startedAt)}</span>
            </div>
            {left != null && d.state !== 'done' && <div className={`badge ${left < 300000 ? 'bad' : 'warn'}`} style={{ margin: '4px auto' }}>{left > 0 ? `${hms(left)} remaining` : 'Time up'}</div>}
            <div className="divider" />
            <div className="row"><span className="mute">Play ({d.players}P · {c.units} × {d.blockMinutes} min)</span><span className="sp" /><b>{inr(c.base)}</b></div>
            {d.snacks.map((s) => <div key={s.name} className="row small"><span>{s.name} × {s.qty}</span><span className="sp" />{inr(s.qty * s.price)}</div>)}
            <div className="total-box mt8"><span className="b">Current bill</span><b>{inr(c.amount)}</b></div>
            <div className="tiny faint">Updates live. Final amount at the counter may include discounts or tax.</div>
          </>}
        </div>
      </div>
    </div>
  );
}
