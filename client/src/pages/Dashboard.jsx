import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Popcorn, ArrowLeftRight, RotateCcw, Eye, EyeOff, ReceiptText, TimerReset, Hourglass, AlertTriangle, LifeBuoy } from 'lucide-react';
import { sessionCharge, hms } from '@shared/pricing.js';
import { api, post, patch } from '../api.js';
import { useAuth, useLive, useNow, useToast } from '../state.jsx';
import { Modal, Field, Spinner, useConfirm, inr } from '../ui.jsx';
import StationCard, { TYPE_ICON } from '../components/StationCard.jsx';
import { BillingPanel, CheckoutModal, SnackSaleModal } from '../components/Billing.jsx';

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach((t) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.18, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.22);
    });
  } catch { /* no audio */ }
}

function Clock({ offset }) {
  const now = new Date(useNow() + offset);
  return (
    <div className="clock">
      <b>{now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</b>
      <span className="small mute">{now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' })} · IST</span>
    </div>
  );
}

export default function Dashboard() {
  const { can, user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [offset, setOffset] = useState(0);
  const [showRev, setShowRev] = useState(false);
  const [typeF, setTypeF] = useState('all');
  const [stateF, setStateF] = useState('all');
  const [modal, setModal] = useState(null); // {kind, st}
  const [checkout, setCheckout] = useState(null);
  const [sale, setSale] = useState(false);
  const [sheet, setSheet] = useState(false);
  const seenAuto = useRef(new Set());

  const load = useCallback(async () => {
    try {
      const t0 = Date.now();
      const d = await api('/dashboard');
      setOffset(d.serverNow - Math.round((t0 + Date.now()) / 2));
      setData(d); setErr('');
      for (const st of d.stations) {
        if (st.session?.state === 'done' && st.session.autoStopped && !seenAuto.current.has(st._id + st.session.endedAt)) {
          seenAuto.current.add(st._id + st.session.endedAt);
          if (Date.now() - new Date(st.session.endedAt).getTime() < 60000) { beep(); toast(`⏰ ${st.name}: time is up — sent to billing`, 'warn', 6000); }
        }
      }
    } catch (e) { setErr(e.message); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);
  useLive(['stations', 'snacks', 'settings', 'invoices'], load);

  const patchStation = (st) => st && setData((d) => d && ({ ...d, stations: d.stations.map((x) => (x._id === st._id ? { ...x, session: st.session } : x)) }));

  const onAct = useCallback(async (kind, st, body) => {
    try {
      if (kind === 'reset' && !(await confirm({ title: `Reset ${st.name}?`, message: 'The timer and snacks on this seat will be cleared WITHOUT a bill. This is logged in the Activity Timeline.', ok: 'Reset without bill', danger: true }))) return;
      let r;
      if (kind === 'session') r = await patch(`/stations/${st._id}/session`, body);
      else if (kind === 'snack') r = await post(`/stations/${st._id}/snack`, body);
      else r = await post(`/stations/${st._id}/${kind}`, body || {});
      patchStation(r.station);
      if (kind === 'done') toast(`${st.name} → billing`);
    } catch (e) { toast(e.message, 'bad'); load(); }
  }, [confirm, toast, load]);
  const onModal = useCallback((kind, st) => setModal({ kind, st }), []);

  const types = useMemo(() => new Map((data?.types || []).map((t) => [t._id, t])), [data?.types]);
  const settings = data?.settings;
  const stations = data?.stations || [];
  const done = useMemo(() => stations.filter((s) => s.session?.state === 'done').map((s) => ({
    ...s,
    charge: sessionCharge({ ms: s.session.accumulatedMs, players: s.session.players, snacks: s.session.snacks, type: types.get(s.type), settings }),
    onContinue: () => onAct('continue', s), onReset: () => onAct('reset', s),
  })), [stations, types, settings, onAct]);

  if (!data) return err ? <div className="card"><b>Could not load the dashboard.</b><div className="mute mt8">{err}</div><button className="btn mt12" onClick={load}>Try again</button></div> : <Spinner center />;

  const counts = (pred) => stations.filter(pred).length;
  const busy = (s) => ['running', 'paused'].includes(s.session?.state);
  const shown = stations.filter((s) => (typeF === 'all' || s.type === typeF)
    && (stateF === 'all' || (stateF === 'free' && s.session?.state === 'idle') || (stateF === 'busy' && busy(s)) || (stateF === 'done' && s.session?.state === 'done')));
  const lowStock = data.snacks.filter((s) => s.trackStock && s.stock <= (settings.lowStockAlert ?? 5));

  const doCheckout = (req, reset) => setCheckout({ req, reset });

  return (
    <>
      <div className="hero mb16">
        <img src="/logo-256.webp" alt="" width="54" height="54" />
        <div style={{ minWidth: 0 }}>
          <h1>{settings.shopName}</h1>
          <div className="mute small">Hi {user.name} 👋 · {counts(busy)} playing · {counts((s) => s.session?.state === 'idle')} free · {done.length} in billing</div>
        </div>
        <span className="sp" />
        {data.revenueToday !== null && (
          <div className="right">
            <div className="small mute row" style={{ justifyContent: 'flex-end', gap: 4 }}>Today's collection
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowRev(!showRev)} aria-label={showRev ? 'Hide revenue' : 'Show revenue'}>{showRev ? <EyeOff /> : <Eye />}</button></div>
            <div className="rev">{showRev ? inr(data.revenueToday) : '₹ • • • •'}</div>
          </div>
        )}
        <Clock offset={offset} />
      </div>

      <div className="dash-top">
        {can('snacksSale') && <button className="btn btn-primary" onClick={() => setSale(true)}><Popcorn />Snacks Sale</button>}
        {can('transfer') && <button className="btn" onClick={() => setModal({ kind: 'transfer' })}><ArrowLeftRight />Transfer</button>}
        {can('reset') && <button className="btn btn-danger" onClick={async () => {
          if (!counts((s) => s.session?.state !== 'idle')) return toast('Nothing to reset', 'warn');
          if (!(await confirm({ title: 'Reset ALL stations?', message: 'Every running, paused and finished session will be cleared WITHOUT billing.', ok: 'Reset all', danger: true }))) return;
          try { const r = await post('/stations/reset-all'); toast(`${r.count} station(s) reset`); load(); } catch (e) { toast(e.message, 'bad'); }
        }}><RotateCcw />Reset All</button>}
        <span className="sp" />
        {lowStock.length > 0 && <span className="badge warn" title={lowStock.map((s) => `${s.name}: ${s.stock}`).join(', ')}><AlertTriangle />{lowStock.length} item(s) low stock</span>}
        <Link to="/help" className="btn btn-ghost btn-sm help-link"><LifeBuoy />Help</Link>
      </div>

      <div className="filters">
        <button className={`chip ${typeF === 'all' ? 'on' : ''}`} onClick={() => setTypeF('all')}>All <span className="cnt">{stations.length}</span></button>
        {data.types.map((t) => { const I = TYPE_ICON[t.icon] || TYPE_ICON.gamepad; const n = counts((s) => s.type === t._id); return n ? <button key={t._id} className={`chip ${typeF === t._id ? 'on' : ''}`} onClick={() => setTypeF(t._id)}><I size={15} />{t.name} <span className="cnt">{counts((s) => s.type === t._id && s.session?.state === 'idle')}/{n} free</span></button> : null; })}
        <span style={{ width: 1, background: 'var(--line)', flex: 'none' }} />
        {[['all', 'Any status'], ['free', 'Free'], ['busy', 'Playing'], ['done', 'In billing']].map(([k, l]) => <button key={k} className={`chip ${stateF === k ? 'on' : ''}`} onClick={() => setStateF(k)}>{l}</button>)}
      </div>

      <div className="dash">
        <div>
          {stations.length === 0
            ? <div className="card empty"><b>No stations yet.</b><div className="small mt8">Add your PS5s, PCs and tables in <Link to="/setup/stations">Shop Setup → Stations</Link>.</div></div>
            : <div className="sgrid">
              {shown.map((st) => <StationCard key={st._id} st={st} type={types.get(st.type)} snacks={data.snacks} settings={settings} offset={offset} can={can} onAct={onAct} onModal={onModal} />)}
              {!shown.length && <div className="mute">No stations match this filter.</div>}
            </div>}
        </div>
        <div className={`billing-col ${sheet ? 'open' : ''}`}>
          {sheet && <div className="row mb8"><b className="sp">Billing</b><button className="btn btn-sm" onClick={() => setSheet(false)}>Close</button></div>}
          {can('billing')
            ? <BillingPanel done={done} types={types} settings={settings} onCheckout={(r, reset) => { setSheet(false); doCheckout(r, reset); }} />
            : <div className="card mute">Billing is handled by the owner / cashier.</div>}
        </div>
      </div>
      {sheet && <div className="scrim" style={{ zIndex: 50 }} onClick={() => setSheet(false)} />}
      {can('billing') && !sheet && <button className="btn btn-primary fab-bill" onClick={() => setSheet(true)}><ReceiptText />Billing{done.length ? ` (${done.length})` : ''}</button>}

      {checkout && <CheckoutModal request={checkout.req} onClose={() => setCheckout(null)} onPaid={() => { checkout.reset?.(); load(); }} />}
      {sale && <SnackSaleModal snacks={data.snacks} settings={settings} onClose={() => { setSale(false); load(); }} />}
      {modal?.kind === 'timer' && <EditTimerModal st={modal.st} offset={offset} onClose={() => setModal(null)} onSaved={(s) => { patchStation(s); setModal(null); }} />}
      {modal?.kind === 'stop' && <StopTimerModal st={modal.st} onClose={() => setModal(null)} onSaved={(s) => { patchStation(s); setModal(null); }} />}
      {modal?.kind === 'transfer' && <TransferModal stations={stations} types={types} from={modal.st} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
    </>
  );
}

/* ---------------- small modals ---------------- */
function EditTimerModal({ st, offset, onClose, onSaved }) {
  const toast = useToast();
  const s = st.session;
  const cur = s.accumulatedMs + (s.state === 'running' && s.lastResumedAt ? Date.now() + offset - new Date(s.lastResumedAt).getTime() : 0);
  const [h, m, sec] = hms(cur).split(':');
  const [v, setV] = useState({ h, m, s: sec });
  const save = async (e) => {
    e.preventDefault();
    const ms = ((+v.h || 0) * 3600 + (+v.m || 0) * 60 + (+v.s || 0)) * 1000;
    try { const r = await post(`/stations/${st._id}/timer`, { elapsedMs: ms }); toast(`${st.name} timer set to ${hms(ms)}`); onSaved(r.station); } catch (x) { toast(x.message, 'bad'); }
  };
  const box = (k, max) => (
    <input className="input center" style={{ fontSize: 22, fontWeight: 800, height: 54 }} inputMode="numeric" value={v[k]} aria-label={k}
      onFocus={(e) => e.target.select()}
      onChange={(e) => { const d = e.target.value.replace(/\D/g, '').slice(-2); setV({ ...v, [k]: d === '' ? '' : String(Math.min(max, +d)) }); }}
      onBlur={() => setV((p) => ({ ...p, [k]: String(+p[k] || 0).padStart(2, '0') }))} />
  );
  return (
    <Modal title={`Edit timer — ${st.name}`} icon={TimerReset} size="narrow" onClose={onClose}>
      <form onSubmit={save} className="col gap12">
        <div className="mute small">Set how long they have <b>already played</b>. The start time adjusts automatically. Every change is logged.</div>
        <div className="grid3">{box('h', 23)}{box('m', 59)}{box('s', 59)}</div>
        <div className="grid3 tiny mute center"><span>Hours</span><span>Minutes</span><span>Seconds</span></div>
        <button className="btn btn-primary btn-block">Update timer</button>
      </form>
    </Modal>
  );
}

function StopTimerModal({ st, onClose, onSaved }) {
  const toast = useToast();
  const [custom, setCustom] = useState('');
  const set = async (minutes) => {
    try { const r = await post(`/stations/${st._id}/stop-timer`, { minutes }); toast(minutes ? `${st.name} will stop at ${minutes} min` : 'Stop timer cleared'); onSaved(r.station); } catch (x) { toast(x.message, 'bad'); }
  };
  return (
    <Modal title={`Stop timer — ${st.name}`} icon={Hourglass} size="narrow" onClose={onClose}>
      <div className="col gap12">
        <div className="mute small">For prepaid time: when the total play time reaches this, the session ends by itself, a beep plays and the bill card appears in Billing.</div>
        <div className="grid3">{[30, 60, 90, 120, 180, 240].map((m) => <button key={m} className={`btn ${st.session.stopAtMinutes === m ? 'btn-primary' : ''}`} onClick={() => set(m)}>{m >= 60 ? `${m / 60} hr` : `${m} min`}</button>)}</div>
        <div className="row"><input className="input" inputMode="numeric" placeholder="Custom minutes" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, ''))} /><button className="btn btn-primary" disabled={!custom} onClick={() => set(+custom)}>Set</button></div>
        {st.session.stopAtMinutes && <button className="btn btn-danger" onClick={() => set(null)}>Clear stop timer ({st.session.stopAtMinutes} min)</button>}
      </div>
    </Modal>
  );
}

function TransferModal({ stations, types, from, onClose, onDone }) {
  const toast = useToast();
  const active = stations.filter((s) => ['running', 'paused'].includes(s.session?.state));
  const free = stations.filter((s) => s.session?.state === 'idle');
  const [f, setF] = useState(from?._id || active[0]?._id || '');
  const [t, setT] = useState(free[0]?._id || '');
  const go = async () => {
    try { await post('/stations/transfer', { from: f, to: t }); toast('Session moved — time kept'); onDone(); } catch (x) { toast(x.message, 'bad'); }
  };
  return (
    <Modal title="Transfer station" icon={ArrowLeftRight} size="narrow" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!f || !t} onClick={go}>Transfer</button></>}>
      {!active.length ? <div className="mute">No running session to move.</div> : !free.length ? <div className="mute">No free station available.</div> : (
        <div className="col gap12">
          <div className="small mute">Moves time, players, snacks and customer to the new seat. Players are capped to what the new station allows.</div>
          <Field label="From (playing)"><select className="input" value={f} onChange={(e) => setF(e.target.value)}>{active.map((s) => <option key={s._id} value={s._id}>{s.name} · {types.get(s.type)?.name}</option>)}</select></Field>
          <Field label="To (free)"><select className="input" value={t} onChange={(e) => setT(e.target.value)}>{free.map((s) => <option key={s._id} value={s._id}>{s.name} · {types.get(s.type)?.name}</option>)}</select></Field>
        </div>
      )}
    </Modal>
  );
}
