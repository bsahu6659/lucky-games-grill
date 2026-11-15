import { useEffect, useState } from 'react';
import { Users, UserPlus, WalletCards, Gift, Phone, Pencil, Download, IndianRupee, Repeat, Clock3 } from 'lucide-react';
import { get, post, put } from '../api.js';
import { useAuth, useFetch, useToast } from '../state.jsx';
import { PageHead, SearchBox, Seg, Spinner, Empty, Modal, Field, KpiGrid, Kpi, inr, fDate, fDateTime, useDebounced, downloadCSV, MODE_LABEL } from '../ui.jsx';
import { InvoiceModal } from '../components/Billing.jsx';

export default function Customers() {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('recent');
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState(null);
  const [add, setAdd] = useState(false);
  const dq = useDebounced(q.trim());
  const { data, loading, reload } = useFetch(`/customers?${new URLSearchParams({ q: dq, sort, filter })}`, [], { live: ['customers', 'invoices'] });
  const list = data || [];
  const exportCsv = () => downloadCSV('customers.csv', [['Name', 'Phone', 'Visits', 'Total spent', 'Last visit', 'Wallet', 'Wallet expiry', 'Points', 'Credit due', 'Note'],
    ...list.map((c) => [c.name, c.phone, c.visits, c.totalSpent, fDate(c.lastVisitAt), c.walletBalance, fDate(c.walletExpiresAt), c.loyaltyPoints, c.creditDue, c.note])]);

  return (
    <>
      <PageHead title="Customers" sub="Saved automatically when you bill with a phone number">
        <button className="btn" onClick={exportCsv} disabled={!list.length}><Download />Export</button>
        <button className="btn btn-primary" onClick={() => setAdd(true)}><UserPlus />Add customer</button>
      </PageHead>
      <div className="row wrap mb12" style={{ gap: 10 }}>
        <SearchBox value={q} onChange={setQ} placeholder="Search name or phone" style={{ flex: 1, minWidth: 220 }} />
        <Seg value={filter} onChange={setFilter} options={[['', 'All'], ['credit', 'Owes money'], ['wallet', 'Has wallet']]} />
        <select className="input fit" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="recent">Recent visit</option><option value="spend">Top spenders</option><option value="visits">Most visits</option><option value="name">Name A–Z</option>
        </select>
      </div>
      <div className="card card-pad0">
        {loading && !data ? <Spinner center /> : !list.length ? <Empty icon={Users} title="No customers yet">Customers are created the first time you bill someone with their phone number.</Empty> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Customer</th><th className="num hide-sm">Visits</th><th className="num">Spent</th><th className="hide-sm">Last visit</th><th className="num">Wallet</th><th className="num hide-sm">Points</th><th className="num">Due</th></tr></thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c._id} onClick={() => setOpen(c._id)} style={{ cursor: 'pointer' }}>
                    <td><b>{c.name}</b><div className="tiny mute">{c.phone}{c.membershipName ? ` · ${c.membershipName}` : ''}</div></td>
                    <td className="num hide-sm">{c.visits}</td>
                    <td className="num">{inr(c.totalSpent)}</td>
                    <td className="hide-sm small mute">{fDate(c.lastVisitAt)}</td>
                    <td className="num">{c.walletBalance > 0 ? inr(c.walletBalance) : '—'}</td>
                    <td className="num hide-sm">{c.loyaltyPoints || 0}</td>
                    <td className="num">{c.creditDue > 0 ? <span className="badge bad">{inr(c.creditDue)}</span> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {open && <CustomerModal id={open} onClose={() => { setOpen(null); reload(); }} />}
      {add && <AddCustomer onClose={() => setAdd(false)} onSaved={(c) => { setAdd(false); reload(); setOpen(c._id); }} />}
    </>
  );
}

function AddCustomer({ onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({ name: '', phone: '', note: '' });
  const save = async (e) => {
    e.preventDefault();
    try { onSaved(await post('/customers', f)); toast('Customer saved'); } catch (x) { toast(x.message, 'bad'); }
  };
  return (
    <Modal title="Add customer" icon={UserPlus} size="narrow" onClose={onClose}>
      <form className="col gap12" onSubmit={save}>
        <Field label="Phone"><input className="input" inputMode="numeric" maxLength={10} required value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, '') })} /></Field>
        <Field label="Name"><input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Note" hint="optional"><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <button className="btn btn-primary btn-block">Save</button>
      </form>
    </Modal>
  );
}

export function CustomerModal({ id, onClose }) {
  const { can } = useAuth();
  const toast = useToast();
  const [d, setD] = useState(null);
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({});
  const [plans, setPlans] = useState([]);
  const [rc, setRc] = useState({ planId: '', mode: 'cash' });
  const [inv, setInv] = useState(null);
  const load = () => get(`/customers/${id}`).then((x) => { setD(x); setF({ name: x.customer.name, note: x.customer.note || '' }); }).catch((e) => toast(e.message, 'bad'));
  useEffect(() => { load(); if (can('memberships')) get('/plans').then((p) => setPlans(p.filter((x) => x.active))); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => { try { await put(`/customers/${id}`, f); toast('Saved'); setEdit(false); load(); } catch (e) { toast(e.message, 'bad'); } };
  const recharge = async () => {
    try { const r = await post(`/customers/${id}/recharge`, rc); toast(`Wallet recharged → ${inr(r.customer.walletBalance)}`); setRc({ planId: '', mode: 'cash' }); load(); setInv(r.invoice._id); } catch (e) { toast(e.message, 'bad'); }
  };
  if (inv) return <InvoiceModal id={inv} onClose={() => setInv(null)} title="Recharge receipt" />;
  const c = d?.customer;
  return (
    <Modal title={c ? c.name : 'Customer'} icon={Users} size="wide" onClose={onClose}>
      {!d ? <Spinner center /> : (
        <div className="col gap16">
          <div className="row wrap" style={{ gap: 8 }}>
            <a className="badge" href={`tel:${c.phone}`}><Phone />{c.phone}</a>
            {c.membershipName && <span className="badge info"><WalletCards />{c.membershipName}</span>}
            <span className="badge">Since {fDate(c.createdAt)}</span>
            <span className="sp" />
            {!edit && <button className="btn btn-sm" onClick={() => setEdit(true)}><Pencil />Edit</button>}
          </div>
          {edit && (
            <div className="grid2">
              <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
              <Field label="Note"><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
              <div className="row"><button className="btn btn-primary" onClick={save}>Save</button><button className="btn" onClick={() => setEdit(false)}>Cancel</button></div>
            </div>
          )}
          {c.note && !edit && <div className="small mute">Note: {c.note}</div>}
          <KpiGrid cols={5}>
            <Kpi hl icon={IndianRupee} label="Total spent" value={inr(c.totalSpent)} sub={`Last visit ${fDate(c.lastVisitAt)}`} />
            <Kpi icon={Repeat} label="Visits" value={c.visits} />
            <Kpi icon={WalletCards} label="Wallet" tone={c.walletBalance > 0 ? 'brand' : ''} value={inr(c.walletBalance)} sub={c.walletExpiresAt ? `till ${fDate(c.walletExpiresAt)}` : undefined} />
            <Kpi icon={Gift} label="Points" value={c.loyaltyPoints || 0} />
            <Kpi icon={Clock3} label="Credit due" tone={c.creditDue > 0 ? 'bad' : ''} value={inr(c.creditDue)} />
          </KpiGrid>
          {can('memberships') && plans.length > 0 && (
            <div className="card" style={{ background: 'var(--bg2)' }}>
              <h3 className="mb8">Recharge wallet</h3>
              <div className="row wrap" style={{ gap: 8 }}>
                <select className="input" style={{ flex: 2, minWidth: 200 }} value={rc.planId} onChange={(e) => setRc({ ...rc, planId: e.target.value })}>
                  <option value="">Choose a plan…</option>
                  {plans.map((p) => <option key={p._id} value={p._id}>{p.name}: pay {inr(p.price)} → wallet {inr(p.credit)} · {p.validityDays} days</option>)}
                </select>
                <Seg value={rc.mode} onChange={(m) => setRc({ ...rc, mode: m })} options={[['cash', 'Cash'], ['online', 'Online']]} />
                <button className="btn btn-primary" disabled={!rc.planId} onClick={recharge}>Recharge</button>
              </div>
            </div>
          )}
          <div>
            <h3 className="mb8">Playing history</h3>
            {!d.invoices.length ? <div className="mute small">No bills yet.</div> : (
              <div className="tbl-wrap card card-pad0"><table className="tbl">
                <thead><tr><th>Date</th><th>Invoice</th><th className="hide-sm">What</th><th className="num">Total</th><th>Mode</th></tr></thead>
                <tbody>{d.invoices.map((v) => (
                  <tr key={v._id} onClick={() => setInv(v._id)} style={{ cursor: 'pointer', opacity: v.status === 'cancelled' ? 0.5 : 1 }}>
                    <td className="small">{fDateTime(v.createdAt)}</td><td className="small">{v.no}</td>
                    <td className="small hide-sm">{v.items.map((i) => i.stationName || i.label).join(', ')}</td>
                    <td className="num b">{inr(v.total)}</td>
                    <td>{v.status === 'pending' ? <span className="badge bad">Pending</span> : <span className="badge">{MODE_LABEL[v.payment?.mode]}</span>}</td>
                  </tr>))}</tbody>
              </table></div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
