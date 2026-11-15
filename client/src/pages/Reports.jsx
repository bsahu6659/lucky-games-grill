import { useState } from 'react';
import { Banknote, Smartphone, WalletCards, Percent, Clock3, TrendingUp, TrendingDown, Download, Activity as ActivityIcon, AlertTriangle, ReceiptText, Crown, Scale, ChevronLeft, ChevronRight, Timer, Hourglass, Flame, PiggyBank } from 'lucide-react';
import { post } from '../api.js';
import { useFetch, useToast } from '../state.jsx';
import { PageHead, Spinner, Empty, SearchBox, KpiGrid, Kpi, useConfirm, useDebounced, inr, fTime, fDateTime, todayKey, dayLabel, MODE_LABEL, downloadCSV } from '../ui.jsx';
import { InvoiceModal } from '../components/Billing.jsx';

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const shiftDay = (k, n) => { const d = new Date(`${k}T12:00:00+05:30`); d.setUTCDate(d.getUTCDate() + n); return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); };

function DayPicker({ date, setDate }) {
  const today = todayKey();
  return (
    <div className="daypick">
      <button className="btn btn-icon" aria-label="Previous day" onClick={() => setDate(shiftDay(date, -1))}><ChevronLeft /></button>
      <input type="date" className="input" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
      <button className="btn btn-icon" aria-label="Next day" disabled={date >= today} onClick={() => setDate(shiftDay(date, 1))}><ChevronRight /></button>
      {date !== today && <button className="btn btn-ghost" onClick={() => setDate(today)}>Today</button>}
    </div>
  );
}

function Bars({ data, value, label, fmt = (x) => x }) {
  const max = Math.max(1, ...data.map(value));
  return (
    <div>
      <div className="bars">{data.map((d, i) => { const v = value(d); return <div key={i} className={`bar ${v ? '' : 'zero'}`} style={{ height: `${Math.max(2, (v / max) * 100)}%` }} title={`${label(d)}: ${fmt(v)}`} />; })}</div>
      <div className="bar-x">{data.map((d, i) => <span key={i}>{label(d, i)}</span>)}</div>
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
      <input type="date" className="input fit" value={from} onChange={(e) => setFrom(e.target.value)} />
      <span className="mute">to</span>
      <input type="date" className="input fit" value={to} onChange={(e) => setTo(e.target.value)} />
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
  const cashPct = k.collected ? Math.round((k.cash / k.collected) * 100) : 0;
  const exportCsv = () => downloadCSV(`daily-${date}.csv`, [['Invoice', 'Time', 'Customer', 'Items', 'Total', 'Mode', 'Cash', 'Online', 'Wallet', 'Status'],
    ...data.invoices.map((v) => [v.no, fDateTime(v.createdAt), v.customer?.name, v.items.map((i) => i.stationName || i.label).join(' | '), v.total, v.payment?.mode, v.payment?.cash, v.payment?.online, v.payment?.wallet, v.status]),
    [], ['Collected', k.collected], ['Cash', k.cash], ['Online', k.online], ['Expenses', k.expenses], ['Other income', k.income], ['Net', k.net]]);
  return (
    <>
      <PageHead title="Daily Revenue" sub={`Cash in hand, UPI, pending credit and net for ${dayLabel(date)}`}>
        <DayPicker date={date} setDate={setDate} />
        <button className="btn" onClick={exportCsv}><Download />Excel</button>
      </PageHead>
      <div className="col gap12 mb16">
        <KpiGrid cols={4}>
          <Kpi lg hl icon={TrendingUp} label={date === todayKey() ? 'Collected today' : 'Collected'} value={inr(k.collected)} sub={`Cash ${inr(k.cash)} · Online ${inr(k.online)}`}>
            <div className="split" aria-hidden="true"><i style={{ width: `${cashPct}%` }} /><b style={{ width: `${k.collected ? 100 - cashPct : 0}%` }} /></div>
          </Kpi>
          <Kpi lg icon={Scale} label="Net" tone={k.net < 0 ? 'bad' : k.net > 0 ? 'good' : ''} value={inr(k.net)} sub={`+${inr(k.income)} income · −${inr(k.expenses)} expenses`} />
          <Kpi lg icon={ReceiptText} label="Bills" value={k.invoices} sub={`Billed ${inr(k.billed)}${k.tax ? ` · GST ${inr(k.tax)}` : ''}`} />
          <Kpi lg icon={Clock3} label="Pending credit" tone={k.pendingAll ? 'bad' : ''} value={inr(k.pendingAll)} sub={`${inr(k.creditGiven)} given on credit this day`} />
        </KpiGrid>
        <KpiGrid cols={6}>
          <Kpi icon={Banknote} label="Cash" value={inr(k.cash)} />
          <Kpi icon={Smartphone} label="Online / UPI" value={inr(k.online)} />
          <Kpi icon={WalletCards} label="Wallet used" value={inr(k.walletUsed)} />
          <Kpi icon={Crown} label="Memberships" value={inr(k.memberships)} />
          <Kpi icon={Percent} label="Discounts" value={inr(k.discounts)} />
          <Kpi icon={TrendingDown} label="Expenses" value={inr(k.expenses)} />
        </KpiGrid>
      </div>
      {data.pending.length > 0 && (
        <div className="card card-pad0 mb16">
          <div className="card-h"><Clock3 style={{ color: 'var(--bad)' }} /><h3>Pending credit</h3><span className="cnt">all days · {data.pending.length}</span></div>
          <div className="tbl-wrap"><table className="tbl"><tbody>{data.pending.map((v) => (
            <tr key={v._id}><td className="small">{fDateTime(v.createdAt)}</td><td><b>{v.customer?.name}</b> <span className="tiny mute">{v.customer?.phone}</span></td><td className="num b">{inr(v.total)}</td>
              <td className="right" style={{ whiteSpace: 'nowrap' }}><button className="btn btn-sm btn-ok" onClick={() => collect(v, 'cash')}><Banknote />Cash</button> <button className="btn btn-sm" onClick={() => collect(v, 'online')}><Smartphone />Online</button></td></tr>))}</tbody></table></div>
        </div>
      )}
      <div className="card card-pad0">
        <div className="card-h"><ReceiptText /><h3>Invoice history</h3><span className="cnt">{data.invoices.length}</span></div>
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
        <input type="month" className="input fit" value={month} onChange={(e) => setMonth(e.target.value)} />
        <button className="btn" onClick={() => downloadCSV(`monthly-${month}.csv`, [['Date', 'Collected', 'Cash', 'Online', 'Billed', 'Other income', 'Expenses'], ...data.days.map((d) => [d.date, d.collected, d.cash, d.online, d.billed, d.income, d.expenses]), [], ['Total', t.collected, t.cash, t.online, t.billed, t.income, t.expenses], ['Net', t.net]])}><Download />Excel</button>
      </PageHead>
      <KpiGrid cols={6} className="mb16">
        <Kpi hl icon={TrendingUp} label="Collected" value={inr(t.collected)} />
        <Kpi icon={Banknote} label="Cash" value={inr(t.cash)} />
        <Kpi icon={Smartphone} label="Online / UPI" value={inr(t.online)} />
        <Kpi icon={PiggyBank} label="Other income" value={inr(t.income)} />
        <Kpi icon={TrendingDown} label="Expenses" value={inr(t.expenses)} />
        <Kpi icon={Scale} label="Net profit" tone={t.net < 0 ? 'bad' : t.net > 0 ? 'good' : ''} value={inr(t.net)} />
      </KpiGrid>
      <div className="card mb16"><h3 className="mb8">Collection per day</h3><Bars data={all} value={(d) => d.collected} label={(d) => { const n = +d.date.slice(8); return n === 1 || n % 5 === 0 ? n : ''; }} fmt={inr} /></div>
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
      <KpiGrid cols={4} className="mb16">
        <Kpi hl icon={ActivityIcon} label="Sessions" value={data.sessions} />
        <Kpi icon={Timer} label="Play time" value={`${data.playHours} h`} />
        <Kpi icon={Hourglass} label="Avg session" value={`${data.avgMinutes} min`} />
        <Kpi icon={Flame} label="Peak hour" value={h(data.peakHour)} />
      </KpiGrid>
      {!data.sessions ? <div className="card"><Empty icon={ActivityIcon} title="No billed sessions in this range" /></div> : <>
        <div className="card mb16"><h3 className="mb8">Sessions started by hour</h3><Bars data={data.hours.map((v, i) => ({ i, v }))} value={(d) => d.v} label={(d) => (d.i % 3 ? '' : `${d.i % 12 || 12}${d.i < 12 ? 'a' : 'p'}`)} /></div>
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
        <input type="date" className="input fit" value={date} onChange={(e) => setDate(e.target.value)} />
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
