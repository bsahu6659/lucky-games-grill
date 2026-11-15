import { useState } from 'react';
import { CalendarClock, CalendarPlus, Phone, Pencil, Trash2, MessageCircle } from 'lucide-react';
import { post, put, del } from '../api.js';
import { useFetch, useToast } from '../state.jsx';
import { PageHead, Seg, Spinner, Empty, Modal, Field, useConfirm, todayKey, dayLabel, mins } from '../ui.jsx';

const STATUS = { pending: 'warn', confirmed: 'info', arrived: 'brand', completed: 'ok', cancelled: '', 'no-show': 'bad' };

export default function Bookings() {
  const toast = useToast();
  const confirm = useConfirm();
  const [mode, setMode] = useState('day');
  const [date, setDate] = useState(todayKey());
  const [edit, setEdit] = useState(null);
  const path = mode === 'day' ? `/bookings?date=${date}` : '/bookings?upcoming=1';
  const { data, loading, reload } = useFetch(path, [], { live: ['bookings'] });
  const { data: dash } = useFetch('/dashboard');
  const list = data || [];

  const setStatus = async (b, status) => {
    try { await put(`/bookings/${b._id}`, { status }); toast(`${b.customerName}: ${status}`); reload(); } catch (e) { toast(e.message, 'bad'); }
  };
  const remove = async (b) => {
    if (!(await confirm({ title: 'Delete booking?', message: `${b.customerName} · ${dayLabel(b.date)} ${b.time}`, ok: 'Delete', danger: true }))) return;
    try { await del(`/bookings/${b._id}`); toast('Deleted'); reload(); } catch (e) { toast(e.message, 'bad'); }
  };
  const shift = (n) => { const d = new Date(`${date}T12:00:00+05:30`); d.setDate(d.getDate() + n); setDate(d.toISOString().slice(0, 10)); };
  const wa = (b) => `https://wa.me/91${b.phone}?text=${encodeURIComponent(`Hi ${b.customerName}, your booking at Lucky Games & Grill is confirmed for ${dayLabel(b.date)} at ${b.time} (${mins(b.durationMinutes)}${b.stationType ? `, ${b.stationType.name}` : ''}). See you! 🎮`)}`;

  return (
    <>
      <PageHead title="Bookings" sub="Phone-in and walk-up reservations · double-booking of a station is blocked">
        <button className="btn btn-primary" onClick={() => setEdit({ date, time: '18:00', durationMinutes: 60, players: 1, status: 'confirmed' })}><CalendarPlus />New booking</button>
      </PageHead>
      <div className="row wrap mb12" style={{ gap: 10 }}>
        <Seg value={mode} onChange={setMode} options={[['day', 'By day'], ['upcoming', 'All upcoming']]} />
        {mode === 'day' && <>
          <button className="btn btn-sm" onClick={() => shift(-1)}>‹</button>
          <input type="date" className="input fit" value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="btn btn-sm" onClick={() => shift(1)}>›</button>
          <button className="btn btn-sm btn-ghost" onClick={() => setDate(todayKey())}>Today</button>
        </>}
      </div>
      {loading && !data ? <Spinner center /> : !list.length ? <div className="card"><Empty icon={CalendarClock} title="No bookings">Tap “New booking” when a customer calls to reserve.</Empty></div> : (
        <div className="sgrid">
          {list.map((b) => (
            <div key={b._id} className="card col" style={{ gap: 8, opacity: ['cancelled', 'no-show', 'completed'].includes(b.status) ? 0.65 : 1 }}>
              <div className="row"><b style={{ fontSize: 20 }} className="num">{b.time}</b><span className="mute small">{mode === 'upcoming' ? dayLabel(b.date) : ''} · {mins(b.durationMinutes)}</span><span className="sp" /><span className={`badge ${STATUS[b.status]}`}>{b.status}</span></div>
              <div><b>{b.customerName}</b> <a className="small" href={`tel:${b.phone}`}><Phone size={12} /> {b.phone}</a></div>
              <div className="small mute">{b.stationType?.name || 'Any station'}{b.station ? ` · ${b.station.name}` : ''} · {b.players}P{b.note ? ` · ${b.note}` : ''}</div>
              <div className="row wrap" style={{ gap: 6 }}>
                {['pending', 'confirmed'].includes(b.status) && <button className="btn btn-sm btn-ok" onClick={() => setStatus(b, 'arrived')}>Arrived</button>}
                {b.status === 'pending' && <button className="btn btn-sm" onClick={() => setStatus(b, 'confirmed')}>Confirm</button>}
                {b.status === 'arrived' && <button className="btn btn-sm btn-ok" onClick={() => setStatus(b, 'completed')}>Completed</button>}
                {['pending', 'confirmed'].includes(b.status) && <button className="btn btn-sm" onClick={() => setStatus(b, 'no-show')}>No-show</button>}
                {['pending', 'confirmed'].includes(b.status) && <button className="btn btn-sm btn-ghost" onClick={() => setStatus(b, 'cancelled')}>Cancel</button>}
                <span className="sp" />
                <a className="btn btn-sm btn-icon btn-ghost" href={wa(b)} target="_blank" rel="noreferrer" title="WhatsApp confirmation"><MessageCircle /></a>
                <button className="btn btn-sm btn-icon btn-ghost" onClick={() => setEdit({ ...b, stationType: b.stationType?._id || '', station: b.station?._id || '' })} title="Edit"><Pencil /></button>
                <button className="btn btn-sm btn-icon btn-ghost" onClick={() => remove(b)} title="Delete"><Trash2 /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {edit && <BookingModal value={edit} types={dash?.types || []} stations={dash?.stations || []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </>
  );
}

function BookingModal({ value, types, stations, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({ customerName: '', phone: '', stationType: '', station: '', note: '', ...value });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    try { f._id ? await put(`/bookings/${f._id}`, f) : await post('/bookings', f); toast('Booking saved'); onSaved(); } catch (x) { toast(x.message, 'bad'); }
  };
  const st = stations.filter((s) => !f.stationType || s.type === f.stationType);
  return (
    <Modal title={f._id ? 'Edit booking' : 'New booking'} icon={CalendarPlus} onClose={onClose}>
      <form className="col gap12" onSubmit={save}>
        <div className="grid2">
          <Field label="Customer name"><input className="input" required value={f.customerName} onChange={set('customerName')} /></Field>
          <Field label="Phone"><input className="input" required inputMode="numeric" maxLength={10} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, '') })} /></Field>
          <Field label="Date"><input className="input" type="date" required value={f.date} onChange={set('date')} /></Field>
          <Field label="Time"><input className="input" type="time" required value={f.time} onChange={set('time')} /></Field>
          <Field label="Duration"><select className="input" value={f.durationMinutes} onChange={(e) => setF({ ...f, durationMinutes: +e.target.value })}>{[30, 60, 90, 120, 180, 240, 300].map((m) => <option key={m} value={m}>{mins(m)}</option>)}</select></Field>
          <Field label="Players"><input className="input" type="number" min={1} max={20} value={f.players} onChange={(e) => setF({ ...f, players: +e.target.value })} /></Field>
          <Field label="Game type"><select className="input" value={f.stationType} onChange={(e) => setF({ ...f, stationType: e.target.value, station: '' })}><option value="">Any</option>{types.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}</select></Field>
          <Field label="Station" hint="optional — blocks clashes"><select className="input" value={f.station} onChange={set('station')}><option value="">Any free</option>{st.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select></Field>
        </div>
        <Field label="Status"><select className="input" value={f.status} onChange={set('status')}>{Object.keys(STATUS).map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Note" hint="optional"><input className="input" value={f.note} onChange={set('note')} placeholder="Birthday group, needs 4 controllers…" /></Field>
        <button className="btn btn-primary btn-block">Save booking</button>
      </form>
    </Modal>
  );
}
