import { useState } from 'react';
import { Banknote, Smartphone, WalletCards, Percent, Clock3, TrendingUp, TrendingDown, Download, Activity as ActivityIcon, AlertTriangle, ReceiptText } from 'lucide-react';
import { post } from '../api.js';
import { useFetch, useToast } from '../state.jsx';
import { PageHead, Spinner, Empty, SearchBox, useConfirm, useDebounced, inr, fTime, fDateTime, todayKey, dayLabel, MODE_LABEL, downloadCSV } from '../ui.jsx';
import { InvoiceModal } from '../components/Billing.jsx';

const Stat = ({ k, v, icon: I, hl, color }) => <div className={`stat ${hl ? 'hl' : ''}`}><div className="k">{I && <I size={14} />}{k}</div><div className="v" style={color ? { color } : undefined}>{v}</div></div>;
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

function Bars({ data, value, label, fmt = (x) => x }) {
  const max = Math.max(1, ...data.map(value));
  return (
    <div>
      <div className="bars">{data.map((d, i) => { const v = value(d); return <div key={i} className={`bar ${v ? '' : 'zero'}`} style={{ height: `${Math.max(2, (v / max) * 100)}%` }} title={`${label(d)}: ${fmt(v)}`} />; })}</div>
      <div className="bar-x">{data.map((d, i) => <span key={i}>{data.length > 16 && i % Math.ceil(data.length / 12) ? '' : label(d)}</span>)}</div>
    </div>
  );
}
function HBars({ rows, value, fmt }) {
  const max = Math.max(1, ...rows.map(value));
  return rows.map((r) => <div key={r.name} className="hbar"><span className="small b" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span><div className="track"><div className="fill" style={{ width: `${(value(r) / max) * 100}%` }} /></div><span className="small right num">{fmt(r)}</span></div>);
}
function RangePicker({ from, to, setFrom, setTo }) {
  return (
    <div className="row wrap" style={{ gap: 8 }}>
      <input type="date" className="input" style={{ width: 160 }} value={from} onChange={(e) => setFrom(e.target.value)} />
      <span className="mute">to</span>
      <input type="date" className="input" style={{ width: 160 }} value={to} onChange={(e) => setTo(e.target.value)} />
      {[[0, 'Today'], [6, '7 days'], [29, '30 days']].map(([n, l]) => <button key={l} className="btn btn-sm" onClick={() => { setFrom(daysAgo(n)); setTo(todayKey()); }}>{l}</button>)}
    </div>
  );
}

/* =============== Daily Revenue =============== */
export function Daily() {
  const toast = useToast();
  const confirm = useConfirm();
  const [date, setDate] = useState(todayKey());
  const [view, setView] = useState(null);
  const { data, loading, reload } = useFetch(`/reports/daily?date=${date}`, [], { live: ['invoices', 'expenses'] });
  const collect = async (inv, mode) => {
    if (!(await confirm({ title: `Collect ${inr(inv.total)} from ${inv.customer?.name}?`, message: `Marks ${inv.no} as paid by ${mode}.`, ok: 'Collect' }))) return;
    try { await post(`/invoices/${inv._id}/collect`, { mode }); toast('Collected ✓'); reload(); } catch (e) { toast(e.message, 'bad'); }
  };
  if (!data) return loading ? <Spinner center /> : null;
  const k = data.kpis;
  const exportCsv = () => downloadCSV(`daily-${date}.csv`, [['Invoice', 'Time', 'Customer', 'Items', 'Total', 'Mode', 'Cash', 'Online', 'Wallet', 'Status'],
    ...data.invoices.map((v) => [v.no, fDateTime(v.createdAt), v.customer?.name, v.items.map((i) => i.stationName || i.label).join(' | '), v.total, v.payment?.mode, v.payment?.cash, v.payment?.online, v.payment?.wallet, v.status]),
    [], ['Collected', k.collected], ['Cash', k.cash], ['Online', k.online], ['Expenses', k.expenses], ['Other income', k.income], ['Net', k.net]]);
  return (
    <>
      <PageHead title="Daily Revenue" sub={`Cash in hand, UPI, pending credit and net for ${dayLabel(date)}`}>
        <input type="date" className="input" style={{ width: 170 }} value={date} onChange={(e) => setDate(e.target.value)} />
        <button className="btn" onClick={exportCsv}><Download />Excel</button>
      </PageHead>
      <div className="stats mb16">
        <Stat k="Collected today" v={inr(k.collected)} icon={TrendingUp} hl />
        <Stat k="Cash" v={inr(k.cash)} icon={Banknote} />
        <Stat k="Online / UPI" v={inr(k.online)} icon={Smartphone} />
        <Stat k="Wallet used" v={inr(k.walletUsed)} icon={WalletCards} />
        <Stat k="Membership sales" v={inr(k.memberships)} icon={WalletCards} />
        <Stat k="Discounts given" v={inr(k.discounts)} icon={Percent} />
        <Stat k="Credit given today" v={inr(k.creditGiven)} icon={Clock3} />
        <Stat k="All pending credit" v={inr(k.pendingAll)} icon={Clock3} color={k.pendingAll ? 'var(--bad)' : undefined} />
        <Stat k="Other income" v={inr(k.income)} icon={TrendingUp} />
        <Stat k="Expenses" v={inr(k.expenses)} icon={TrendingDown} />
        <Stat k="Net (cash+online+income−exp)" v={inr(k.net)} hl />
        {k.tax > 0 && <Stat k="GST collected" v={inr(k.tax)} />}
      </div>
      {data.pending.length > 0 && (
        <div className="card card-pad0 mb16">
          <div className="row" style={{ padding: '12px 14px' }}><Clock3 size={16} color="var(--bad)" /><h3>Pending credit (all days)</h3></div>
          <div className="tbl-wrap"><table className="tbl"><tbody>{data.pending.map((v) => (
            <tr key={v._id}><td className="small">{fDateTime(v.createdAt)}</td><td><b>{v.customer?.name}</b> <span className="tiny mute">{v.customer?.phone}</span></td><td className="num b">{inr(v.total)}</td>
              <td className="right" style={{ whiteSpace: 'nowrap' }}><button className="btn btn-sm btn-ok" onClick={() => collect(v, 'cash')}><Banknote />Cash</button> <button className="btn btn-sm" onClick={() => collect(v, 'online')}><Smartphone />Online</button></td></tr>))}</tbody></table></div>
        </div>
      )}
      <div className="card card-pad0">
        <div className="row" style={{ padding: '12px 14px' }}><ReceiptText size={16} color="var(--orange)" /><h3>Invoice history — {data.invoices.length}</h3></div>
        {!data.invoices.length ? <Empty title="No bills on this day" /> : (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Time</th><th>Invoice</th><th>Customer</th><th className="hide-sm">Items</th><th className="num">Total</th><th>Mode</th></tr></thead>
            <tbody>{data.invoices.map((v) => (
              <tr key={v._id} onClick={() => setView(v._id)} style={{ cursor: 'pointer', opacity: v.status === 'cancelled' ? 0.5 : 1 }}>
                <td className="small">{fTime(v.createdAt)}</td><td className="small">{v.no}</td><td>{v.customer?.name || '—'}</td>
                <td className="small hide-sm">{v.items.map((i) => i.stationName || i.label).join(', ')}</td><td className="num b">{inr(v.total)}</td>
                <td>{v.status === 'pending' ? <span className="badge bad">Pending</span> : v.status === 'cancelled' ? <span className="badge">Cancelled</span> : <span className="badge ok">{MODE_LABEL[v.payment?.mode]}</span>}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>
      {view && <InvoiceModal id={view} onClose={() => setView(null)} />}
    </>
  );
}

/* =============== Monthly Revenue =============== */
export function Monthly() {
  const [month, setMonth] = useState(todayKey().slice(0, 7));
  const { data, loading } = useFetch(`/reports/monthly?month=${month}`, [], { live: ['invoices', 'expenses'] });
  if (!data) return loading ? <Spinner center /> : null;
  const t = data.totals;
  const [y, m] = month.split('-').map(Number);
  const all = Array.from({ length: new Date(y, m, 0).getDate() }, (_, i) => { const k = `${month}-${String(i + 1).padStart(2, '0')}`; return data.days.find((d) => d.date === k) || { date: k, collected: 0, expenses: 0, cash: 0, online: 0, billed: 0, income: 0 }; });
  return (
    <>
      <PageHead title="Monthly Revenue" sub="Day-by-day collection, expenses, profit and GST summary">
        <input type="month" className="input" style={{ width: 170 }} value={month} onChange={(e) => setMonth(e.target.value)} />
        <button className="btn" onClick={() => downloadCSV(`monthly-${month}.csv`, [['Date', 'Collected', 'Cash', 'Online', 'Billed', 'Other income', 'Expenses'], ...data.days.map((d) => [d.date, d.collected, d.cash, d.online, d.billed, d.income, d.expenses]), [], ['Total', t.collected, t.cash, t.online, t.billed, t.income, t.expenses], ['Net', t.net]])}><Download />Excel</button>
      </PageHead>
      <div className="stats mb16">
        <Stat k="Collected" v={inr(t.collected)} hl icon={TrendingUp} /><Stat k="Cash" v={inr(t.cash)} icon={Banknote} /><Stat k="Online" v={inr(t.online)} icon={Smartphone} />
        <Stat k="Other income" v={inr(t.income)} /><Stat k="Expenses" v={inr(t.expenses)} icon={TrendingDown} /><Stat k="Net profit" v={inr(t.net)} hl color={t.net < 0 ? 'var(--bad)' : undefined} />
      </div>
      <div className="card mb16"><h3 className="mb8">Collection per day</h3><Bars data={all} value={(d) => d.collected} label={(d) => +d.date.slice(8)} fmt={inr} /></div>
      <div className="grid2" style={{ alignItems: 'start' }}>
        <div className="card"><h3 className="mb8">Expenses by category</h3>
          {Object.keys(data.byCategory).length ? <HBars rows={Object.entries(data.byCategory).map(([name, v]) => ({ name, v })).sort((a, b) => b.v - a.v)} value={(r) => r.v} fmt={(r) => inr(r.v)} /> : <div className="mute small">No expenses this month.</div>}
        </div>
        <div className="card"><h3 className="mb8">GST summary</h3>
          <div className="small col gap4">
            <div className="row"><span>Taxable value (billed, excl. GST)</span><span className="sp" /><b>{inr(t.taxable)}</b></div>
            <div className="row"><span>GST on bills</span><span className="sp" /><b>{inr(t.tax)}</b></div>
            <div className="row"><span>CGST / SGST</span><span className="sp" /><b>{inr(t.tax / 2)} / {inr(t.tax / 2)}</b></div>
            <div className="faint mt8">Turn GST on in Shop Details &amp; Tax. Share this with your CA for GSTR-1 / 3B.</div>
          </div>
        </div>
      </div>
    </>
  );
}

/* =============== System Usage =============== */
export function Usage() {
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(todayKey());
  const { data, loading } = useFetch(`/reports/usage?from=${from}&to=${to}`, [], { live: ['invoices'] });
  if (!data) return loading ? <Spinner center /> : null;
  const h = (n) => (n == null ? '—' : `${n % 12 || 12} ${n < 12 ? 'AM' : 'PM'}`);
  return (
    <>
      <PageHead title="System Usage" sub="Which games earn, when the lounge is busy (from billed sessions)"><RangePicker {...{ from, to, setFrom, setTo }} /></PageHead>
      <div className="stats mb16">
        <Stat k="Sessions" v={data.sessions} hl /><Stat k="Play time" v={`${data.playHours} h`} /><Stat k="Avg session" v={`${data.avgMinutes} min`} /><Stat k="Peak hour" v={h(data.peakHour)} />
      </div>
      {!data.sessions ? <div className="card"><Empty icon={ActivityIcon} title="No billed sessions in this range" /></div> : <>
        <div className="card mb16"><h3 className="mb8">Sessions started by hour</h3><Bars data={data.hours.map((v, i) => ({ i, v }))} value={(d) => d.v} label={(d) => (d.i % 3 ? '' : h(d.i))} /></div>
        <div className="grid2" style={{ alignItems: 'start' }}>
          <div className="card"><h3 className="mb8">Earnings by game type</h3><HBars rows={data.byType} value={(r) => r.revenue} fmt={(r) => `${inr(r.revenue)} · ${r.hours}h`} /></div>
          <div className="card"><h3 className="mb8">Earnings by station</h3><HBars rows={data.byStation} value={(r) => r.revenue} fmt={(r) => `${inr(r.revenue)} · ${r.sessions}`} /></div>
        </div>
      </>}
    </>
  );
}

/* =============== Snacks & stock =============== */
export function SnacksReport() {
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(todayKey());
  const { data, loading } = useFetch(`/reports/snacks?from=${from}&to=${to}`, [], { live: ['invoices', 'snacks'] });
  if (!data) return loading ? <Spinner center /> : null;
  const low = data.stock.filter((s) => s.low && s.active);
  return (
    <>
      <PageHead title="Snacks & Stock" sub="What sells, and what to re-order"><RangePicker {...{ from, to, setFrom, setTo }} /></PageHead>
      {low.length > 0 && <div className="card mb16" style={{ borderColor: 'rgba(245,158,11,.5)' }}><div className="row wrap" style={{ gap: 6 }}><AlertTriangle size={16} color="var(--warn)" /><b>Low stock:</b>{low.map((s) => <span key={s._id} className="badge warn">{s.name}: {s.stock}</span>)}</div></div>}
      <div className="grid2" style={{ alignItems: 'start' }}>
        <div className="card"><h3 className="mb8">Best sellers</h3>{data.sold.length ? <HBars rows={data.sold} value={(r) => r.qty} fmt={(r) => `${r.qty} · ${inr(r.revenue)}`} /> : <div className="mute small">Nothing sold in this range.</div>}</div>
        <div className="card card-pad0"><div style={{ padding: '12px 14px' }}><h3>Current stock</h3></div>
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Item</th><th className="num">Stock</th></tr></thead>
            <tbody>{data.stock.filter((s) => s.active).map((s) => <tr key={s._id}><td>{s.name}</td><td className="num">{s.trackStock ? <span className={`badge ${s.low ? 'warn' : ''}`}>{s.stock}</span> : <span className="faint small">not tracked</span>}</td></tr>)}</tbody></table></div>
        </div>
      </div>
    </>
  );
}

/* =============== Activity Timeline =============== */
export function Activity() {
  const [date, setDate] = useState(todayKey());
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim());
  const { data, loading } = useFetch(`/reports/activity?date=${date}&q=${encodeURIComponent(dq)}`, [], { live: ['stations', 'invoices', 'expenses', 'bookings'] });
  return (
    <>
      <PageHead title="Activity Timeline" sub="Who did what and when — for settling disputes and staff accountability">
        <input type="date" className="input" style={{ width: 170 }} value={date} onChange={(e) => setDate(e.target.value)} />
      </PageHead>
      <SearchBox value={q} onChange={setQ} placeholder="Filter: reset, discount, PS5 1, staff name…" style={{ marginBottom: 12 }} />
      <div className="card card-pad0">
        {loading && !data ? <Spinner center /> : !data?.items.length ? <Empty icon={ActivityIcon} title="No activity" /> : (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Time</th><th>Who</th><th>Action</th><th>Details</th></tr></thead>
            <tbody>{data.items.map((a) => (
              <tr key={a._id}>
                <td className="small num" style={{ whiteSpace: 'nowrap' }}>{fTime(a.at)}</td>
                <td className="small"><b>{a.user?.name || 'System'}</b><div className="tiny mute">{a.user?.role}</div></td>
                <td><span className={`badge ${/reset|cancel|delete|write-off/i.test(a.action) ? 'bad' : /paid|collected|recharge/i.test(a.action) ? 'ok' : /edit|discount|credit/i.test(a.action) ? 'warn' : ''}`}>{a.action}</span></td>
                <td className="small">{a.detail}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
