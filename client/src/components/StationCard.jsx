import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, Square, MoreVertical, TimerReset, Hourglass, ArrowLeftRight, RotateCcw, ChevronDown, ChevronUp, Users, Popcorn, User, Undo2, Gamepad2, Monitor, Circle, Glasses, Car, Joystick } from 'lucide-react';
import { elapsedMs, sessionCharge, hms } from '@shared/pricing.js';
import { useNow } from '../state.jsx';
import { Stepper, inr, fTime } from '../ui.jsx';

export const TYPE_ICON = { gamepad: Gamepad2, monitor: Monitor, circle: Circle, glasses: Glasses, car: Car, joystick: Joystick };

/** Only this tiny part re-renders every second. */
function LiveNumbers({ s, type, settings, offset }) {
  const now = useNow() + offset;
  const ms = elapsedMs(s, now);
  const c = sessionCharge({ ms, players: s.players, snacks: s.snacks, type, settings });
  const left = s.stopAtMinutes ? s.stopAtMinutes * 60000 - ms : null;
  return (
    <>
      <div className="st-time">
        <span className="tm">{hms(ms)}</span>
        <span className="cost">{inr(c.amount)}</span>
      </div>
      <div className="st-meta">
        <span>Start {fTime(s.startedAt)}</span><span>·</span><span>Paid {hms(c.paidMinutes * 60000)}</span>
        {left != null && <span className={`badge ${left < 5 * 60000 ? 'bad' : 'warn'}`}><Hourglass />{left > 0 ? `${hms(left)} left` : 'time up'}</span>}
        {c.bonusMinutes > 0 && <span className="badge ok">+{c.bonusMinutes}m bonus</span>}
      </div>
    </>
  );
}

function StationCard({ st, type, snacks, settings, offset, can, onAct, onModal }) {
  const s = st.session || { state: 'idle' };
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [q, setQ] = useState('');
  const [cust, setCust] = useState(s.customer || {});
  const menuRef = useRef(null);
  const state = s.state || 'idle';
  const active = state === 'running' || state === 'paused';
  const Icon = TYPE_ICON[type?.icon] || Gamepad2;

  useEffect(() => { setCust(s.customer || {}); }, [s.customer?.name, s.customer?.phone, s.customer?.note]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!active) setOpen(false); }, [active]);
  useEffect(() => {
    if (!menu) return;
    const close = (e) => !menuRef.current?.contains(e.target) && setMenu(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menu]);

  const qtyOf = useMemo(() => Object.fromEntries((s.snacks || []).map((x) => [x.snack, x.qty])), [s.snacks]);
  const snackCount = (s.snacks || []).reduce((a, x) => a + x.qty, 0);
  const rates = type?.rates || [];
  const left = s.stopAtMinutes ? s.stopAtMinutes * 60000 - elapsedMs(s, Date.now() + offset) : null;
  const saveCust = () => {
    const a = s.customer || {};
    if ((a.name || '') === (cust.name || '') && (a.phone || '') === (cust.phone || '') && (a.note || '') === (cust.note || '')) return;
    onAct('session', st, { customer: cust });
  };
  const doMenu = (fn) => { setMenu(false); fn(); };

  return (
    <article className={`st ${state} ${state === 'running' && left != null && left < 2 * 60000 ? 'alert' : ''}`} aria-label={st.name}>
      <div className="st-h">
        <span className="dot" />
        <span className="nm">{st.name}</span>
        <span className="badge"><Icon />{type?.name || 'Station'}</span>
        <span className="sp" />
        {active && <span className="badge"><Users />{s.players}P</span>}
        {snackCount > 0 && <span className="badge brand"><Popcorn />{snackCount}</span>}
      </div>

      {state === 'idle' ? (
        <>
          <div className="st-time"><span className="tm">00:00:00</span><span className="cost faint">{inr(0)}</span></div>
          <div className="st-meta"><span>Free · {rates.map((r, i) => `${i + 1}P ${inr(r)}`).join(' · ')} / {type?.blockMinutes || 30}m</span></div>
          <div className="st-act"><button className="btn btn-ok btn-lg" onClick={() => onAct('start', st)}><Play />Start</button></div>
        </>
      ) : state === 'done' ? (
        <>
          <div className="st-time"><span className="tm">{hms(s.accumulatedMs)}</span><span className="cost">{inr(sessionCharge({ ms: s.accumulatedMs, players: s.players, snacks: s.snacks, type, settings }).amount)}</span></div>
          <div className="st-meta"><span>{fTime(s.startedAt)} – {fTime(s.endedAt)}</span>{s.customer?.name && <span>· {s.customer.name}</span>}</div>
          <div className="st-act">
            <span className="badge brand" style={{ height: 38, flex: 1, justifyContent: 'center', borderRadius: 10 }}>In billing →</span>
            <button className="btn" onClick={() => onAct('continue', st)} title="Continue this session"><Undo2 />Continue</button>
          </div>
        </>
      ) : (
        <>
          <LiveNumbers s={s} type={type} settings={settings} offset={offset} />
          {s.customer?.name && !open && <div className="small mute row" style={{ gap: 6 }}><User size={14} />{s.customer.name} {s.customer.phone}</div>}
          <div className="st-act">
            {state === 'running'
              ? <button className="btn btn-warn" onClick={() => onAct('pause', st)}><Pause />Pause</button>
              : <button className="btn btn-ok" onClick={() => onAct('resume', st)}><Play />Resume</button>}
            <button className="btn btn-primary" disabled={state === 'paused'} title={state === 'paused' ? 'Resume first, then Done' : 'End session and send to billing'} onClick={() => onAct('done', st)}><Square />Done</button>
            <div className="st-more" ref={menuRef}>
              <button className="btn btn-icon" aria-label="More actions" aria-expanded={menu} onClick={() => setMenu(!menu)}><MoreVertical /></button>
              {menu && (
                <div className="menu" role="menu">
                  <button disabled={!can('editTimer')} onClick={() => doMenu(() => onModal('timer', st))}><TimerReset />Edit timer</button>
                  <button onClick={() => doMenu(() => onModal('stop', st))}><Hourglass />Stop timer{s.stopAtMinutes ? ` (${s.stopAtMinutes}m)` : ''}</button>
                  <button disabled={!can('transfer')} onClick={() => doMenu(() => onModal('transfer', st))}><ArrowLeftRight />Transfer station</button>
                  <button className="danger" disabled={!can('reset')} onClick={() => doMenu(() => onAct('reset', st))}><RotateCcw />Reset (no bill)</button>
                </div>
              )}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? <ChevronUp /> : <ChevronDown />}{open ? 'Hide details' : 'Players · snacks · customer'}
          </button>
          {open && (
            <div className="det">
              <h4>Players</h4>
              <div className="players">
                {rates.map((r, i) => (
                  <button key={i} className={s.players === i + 1 ? 'on' : ''} onClick={() => s.players !== i + 1 && onAct('session', st, { players: i + 1 })}>
                    <b>{i + 1}P</b><small>{inr(r)}/{type.blockMinutes}m</small>
                  </button>
                ))}
              </div>
              <h4>Snacks &amp; grill</h4>
              {snacks.length > 6 && <input className="input input-sm" placeholder="Search menu…" value={q} onChange={(e) => setQ(e.target.value)} />}
              <div className="snacklist">
                {snacks.filter((x) => x.name.toLowerCase().includes(q.toLowerCase())).map((x) => {
                  const n = qtyOf[x._id] || 0;
                  return (
                    <div key={x._id} className={`snackrow ${n ? 'has' : ''}`}>
                      <span className="n">{x.name} <span className="p">{inr(x.price)}</span></span>
                      <Stepper value={n} onChange={(v) => onAct('snack', st, { snackId: x._id, delta: v - n })} />
                    </div>
                  );
                })}
              </div>
              <h4>Customer (optional)</h4>
              <div className="grid2" style={{ gap: 6 }}>
                <input className="input input-sm" placeholder="Name" value={cust.name || ''} onChange={(e) => setCust({ ...cust, name: e.target.value })} onBlur={saveCust} />
                <input className="input input-sm" placeholder="Phone" inputMode="numeric" maxLength={10} value={cust.phone || ''} onChange={(e) => setCust({ ...cust, phone: e.target.value.replace(/\D/g, '') })} onBlur={saveCust} />
              </div>
              <input className="input input-sm" placeholder="Note (e.g. FIFA, 2 controllers)" value={cust.note || ''} onChange={(e) => setCust({ ...cust, note: e.target.value })} onBlur={saveCust} />
            </div>
          )}
        </>
      )}
    </article>
  );
}

export default memo(StationCard);
