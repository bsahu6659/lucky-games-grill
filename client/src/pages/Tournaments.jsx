import { useState } from 'react';
import { Trophy, Plus, UserPlus, Trash2, Pencil, Medal, CheckCircle2, Banknote, Smartphone } from 'lucide-react';
import { post, put, del } from '../api.js';
import { useFetch, useToast } from '../state.jsx';
import { PageHead, Spinner, Empty, Modal, Field, useConfirm, inr, dayLabel, todayKey } from '../ui.jsx';

const ST = { upcoming: 'info', live: 'ok', completed: 'brand', cancelled: '' };

export default function Tournaments() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, reload } = useFetch('/tournaments', [], { live: ['tournaments'] });
  const [edit, setEdit] = useState(null);
  const [open, setOpen] = useState(null);
  const list = data || [];
  const cur = list.find((t) => t._id === open);

  const remove = async (t) => {
    if (!(await confirm({ title: `Delete ${t.name}?`, message: 'Players and results are removed. Fees already collected stay in Expenses & Income.', ok: 'Delete', danger: true }))) return;
    try { await del(`/tournaments/${t._id}`); toast('Deleted'); setOpen(null); reload(); } catch (e) { toast(e.message, 'bad'); }
  };

  return (
    <>
      <PageHead title="Tournaments" sub="Events, entry fees, check-in and prize payouts — fees go to income, prizes to expenses">
        <button className="btn btn-primary" onClick={() => setEdit({ date: todayKey(), time: '18:00', entryFee: 100, prizePool: 1000, maxPlayers: 16, status: 'upcoming' })}><Plus />New tournament</button>
      </PageHead>
      {loading && !data ? <Spinner center /> : !list.length ? <div className="card"><Empty icon={Trophy} title="No tournaments yet">Create a FIFA / Tekken / Valorant night and register players here.</Empty></div> : (
        <div className="sgrid">
          {list.map((t) => {
            const paid = t.participants.filter((p) => p.paid).length;
            return (
              <div key={t._id} className="card col" style={{ gap: 8, cursor: 'pointer' }} onClick={() => setOpen(t._id)}>
                <div className="row"><Trophy size={18} color="var(--brand)" /><b style={{ fontSize: 16 }}>{t.name}</b><span className="sp" /><span className={`badge ${ST[t.status]}`}>{t.status}</span></div>
                <div className="small mute">{t.game} · {dayLabel(t.date)}{t.time ? ` · ${t.time}` : ''}</div>
                <div className="row wrap small" style={{ gap: 6 }}>
                  <span className="badge">{t.participants.length}/{t.maxPlayers} players</span>
                  <span className="badge">Entry {inr(t.entryFee)}</span><span className="badge brand">Prize {inr(t.prizePool)}</span>
                  <span className="badge ok">{paid} paid · {inr(paid * t.entryFee)}</span>
                </div>
                {t.winners?.length > 0 && <div className="small"><Medal size={14} color="var(--brand)" /> {t.winners.map((w) => `#${w.place} ${w.name}`).join(' · ')}</div>}
              </div>
            );
          })}
        </div>
      )}
      {edit && <TourModal value={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      {cur && <TourDetail t={cur} onClose={() => setOpen(null)} onEdit={() => { setEdit(cur); setOpen(null); }} onDelete={() => remove(cur)} reload={reload} />}
    </>
  );
}

function TourModal({ value, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({ name: '', game: '', rules: '', ...value });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    try { f._id ? await put(`/tournaments/${f._id}`, f) : await post('/tournaments', f); toast('Saved'); onSaved(); } catch (x) { toast(x.message, 'bad'); }
  };
  return (
    <Modal title={f._id ? 'Edit tournament' : 'New tournament'} icon={Trophy} onClose={onClose}>
      <form className="col gap12" onSubmit={save}>
        <div className="grid2">
          <Field label="Name"><input className="input" required value={f.name} onChange={set('name')} placeholder="Sunday FIFA Cup" /></Field>
          <Field label="Game"><input className="input" required value={f.game} onChange={set('game')} placeholder="EA FC 25" /></Field>
          <Field label="Date"><input className="input" type="date" required value={f.date} onChange={set('date')} /></Field>
          <Field label="Time"><input className="input" type="time" value={f.time || ''} onChange={set('time')} /></Field>
          <Field label="Entry fee ₹"><input className="input" type="number" min={0} value={f.entryFee} onChange={set('entryFee')} /></Field>
          <Field label="Prize pool ₹"><input className="input" type="number" min={0} value={f.prizePool} onChange={set('prizePool')} /></Field>
          <Field label="Max players"><input className="input" type="number" min={2} value={f.maxPlayers} onChange={set('maxPlayers')} /></Field>
          <Field label="Status"><select className="input" value={f.status} onChange={set('status')}>{Object.keys(ST).map((s) => <option key={s}>{s}</option>)}</select></Field>
        </div>
        <Field label="Rules" hint="optional"><textarea className="input" value={f.rules || ''} onChange={set('rules')} /></Field>
        <button className="btn btn-primary btn-block">Save</button>
      </form>
    </Modal>
  );
}

function TourDetail({ t, onClose, onEdit, onDelete, reload }) {
  const toast = useToast();
  const [p, setP] = useState({ name: '', phone: '', team: '' });
  const [win, setWin] = useState(() => (t.winners?.length ? t.winners : [{ place: 1, name: '', prize: 0 }, { place: 2, name: '', prize: 0 }, { place: 3, name: '', prize: 0 }]));
  const add = async (e) => {
    e.preventDefault();
    try { await post(`/tournaments/${t._id}/participants`, p); setP({ name: '', phone: '', team: '' }); reload(); } catch (x) { toast(x.message, 'bad'); }
  };
  const upd = async (pid, body) => { try { await put(`/tournaments/${t._id}/participants/${pid}`, body); reload(); } catch (x) { toast(x.message, 'bad'); } };
  const rm = async (pid) => { try { await del(`/tournaments/${t._id}/participants/${pid}`); reload(); } catch (x) { toast(x.message, 'bad'); } };
  const saveWinners = async () => {
    try { await put(`/tournaments/${t._id}`, { winners: win.filter((w) => w.name), status: 'completed' }); toast('Results saved — prizes recorded in Expenses'); reload(); } catch (x) { toast(x.message, 'bad'); }
  };
  const names = t.participants.map((x) => x.name);
  return (
    <Modal title={t.name} icon={Trophy} size="wide" onClose={onClose}
      footer={<><button className="btn btn-danger" onClick={onDelete}><Trash2 />Delete</button><span className="sp" /><button className="btn" onClick={onEdit}><Pencil />Edit</button><button className="btn btn-primary" onClick={onClose}>Done</button></>}>
      <div className="col gap16">
        <div className="small mute">{t.game} · {dayLabel(t.date)} {t.time} · Entry {inr(t.entryFee)} · Prize pool {inr(t.prizePool)}{t.rules ? ` · ${t.rules}` : ''}</div>
        <form className="row wrap" style={{ gap: 8 }} onSubmit={add}>
          <input className="input" style={{ flex: 2, minWidth: 140 }} placeholder="Player name" required value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
          <input className="input" style={{ flex: 1, minWidth: 120 }} placeholder="Phone" inputMode="numeric" maxLength={10} value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value.replace(/\D/g, '') })} />
          <input className="input" style={{ flex: 1, minWidth: 110 }} placeholder="Team (optional)" value={p.team} onChange={(e) => setP({ ...p, team: e.target.value })} />
          <button className="btn btn-primary" disabled={t.participants.length >= t.maxPlayers}><UserPlus />Add</button>
        </form>
        {!t.participants.length ? <div className="mute small">No players registered yet.</div> : (
          <div className="tbl-wrap card card-pad0"><table className="tbl">
            <thead><tr><th>#</th><th>Player</th><th className="hide-sm">Team</th><th>Check-in</th><th>Entry fee</th><th /></tr></thead>
            <tbody>{t.participants.map((x, i) => (
              <tr key={x._id}>
                <td>{i + 1}</td><td><b>{x.name}</b><div className="tiny mute">{x.phone}</div></td><td className="hide-sm">{x.team || '—'}</td>
                <td><label className="check"><input type="checkbox" checked={x.checkedIn} onChange={(e) => upd(x._id, { checkedIn: e.target.checked })} />{x.checkedIn ? 'In' : ''}</label></td>
                <td>{x.paid ? <span className="badge ok"><CheckCircle2 />Paid{x.mode ? ` · ${x.mode}` : ''}</span> : <span className="row" style={{ gap: 4 }}>
                  <button className="btn btn-sm btn-ok" title="Cash" onClick={() => upd(x._id, { paid: true, mode: 'cash' })}><Banknote /></button>
                  <button className="btn btn-sm" title="Online" onClick={() => upd(x._id, { paid: true, mode: 'online' })}><Smartphone /></button></span>}</td>
                <td className="right"><button className="btn btn-sm btn-ghost btn-icon" onClick={() => rm(x._id)} title="Remove"><Trash2 /></button></td>
              </tr>))}</tbody>
          </table></div>
        )}
        <div className="card" style={{ background: 'var(--bg2)' }}>
          <h3 className="mb8"><Medal size={16} color="var(--brand)" /> Results &amp; prizes</h3>
          <div className="col" style={{ gap: 6 }}>
            {win.map((w, i) => (
              <div key={i} className="row" style={{ gap: 6 }}>
                <span className="badge brand" style={{ width: 34, justifyContent: 'center' }}>#{w.place}</span>
                <input className="input input-sm" list="tp" placeholder="Winner" value={w.name} onChange={(e) => setWin(win.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <input className="input input-sm" style={{ width: 110 }} type="number" min={0} placeholder="Prize ₹" value={w.prize} onChange={(e) => setWin(win.map((x, j) => (j === i ? { ...x, prize: +e.target.value } : x)))} />
              </div>
            ))}
            <datalist id="tp">{names.map((n) => <option key={n} value={n} />)}</datalist>
            <button className="btn btn-primary mt8" onClick={saveWinners} disabled={!!t.winners?.length && t.status === 'completed'}>{t.winners?.length ? 'Results saved' : 'Save results & mark completed'}</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
