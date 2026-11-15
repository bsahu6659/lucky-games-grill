import { useState } from 'react';
import { ReceiptText, Banknote, Smartphone, Ban, Download } from 'lucide-react';
import { post } from '../api.js';
import { useAuth, useFetch, useToast } from '../state.jsx';
import { PageHead, SearchBox, Seg, Spinner, Empty, useConfirm, useDebounced, inr, fDateTime, todayKey, MODE_LABEL, downloadCSV } from '../ui.jsx';
import { InvoiceModal } from '../components/Billing.jsx';

export default function Invoices() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [date, setDate] = useState(todayKey());
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [view, setView] = useState(null);
  const dq = useDebounced(q.trim());
  const qs = new URLSearchParams({ ...(date && !dq ? { date } : {}), ...(status ? { status } : {}), ...(dq ? { q: dq } : {}) }).toString();
  const { data, loading, reload } = useFetch(`/invoices?${qs}`, [], { live: ['invoices'] });

  const collect = async (inv, mode) => {
    if (!(await confirm({ title: `Collect ${inr(inv.total)}?`, message: `${inv.no} for ${inv.customer?.name || 'customer'} will be marked paid by ${mode === 'cash' ? 'cash' : 'online / UPI'}.`, ok: 'Mark collected' }))) return;
    try { await post(`/invoices/${inv._id}/collect`, { mode }); toast('Collected ✓'); reload(); } catch (e) { toast(e.message, 'bad'); }
  };
  const cancel = async (inv) => {
    if (!(await confirm({ title: `Cancel ${inv.no}?`, message: 'The bill stays in history as CANCELLED and is removed from revenue. Wallet and points are given back.', ok: 'Cancel invoice', danger: true }))) return;
    try { await post(`/invoices/${inv._id}/cancel`, { reason: 'Cancelled by owner' }); toast('Invoice cancelled'); reload(); } catch (e) { toast(e.message, 'bad'); }
  };
  const list = data || [];
  const exportCsv = () => downloadCSV(`invoices-${date || 'search'}.csv`, [['Invoice', 'Date', 'Type', 'Customer', 'Phone', 'Items', 'Subtotal', 'Adjustment', 'GST', 'Total', 'Mode', 'Cash', 'Online', 'Wallet', 'Status', 'By'],
    ...list.map((v) => [v.no, fDateTime(v.createdAt), v.kind, v.customer?.name, v.customer?.phone, v.items.map((i) => i.label).join(' | '), v.subtotal, v.adjustment, v.taxAmount, v.total, v.payment?.mode, v.payment?.cash, v.payment?.online, v.payment?.wallet, v.status, v.createdBy?.name])]);

  return (
    <>
      <PageHead title="Invoices" sub="Every bill — search, reprint, send on WhatsApp, collect pending credit">
        <button className="btn" onClick={exportCsv} disabled={!list.length}><Download />Excel (CSV)</button>
      </PageHead>
      <div className="row wrap mb12" style={{ gap: 10 }}>
        <input type="date" className="input fit" value={date} onChange={(e) => setDate(e.target.value)} disabled={!!q} />
        <Seg value={status} onChange={setStatus} options={[['', 'All'], ['paid', 'Paid'], ['pending', 'Pending'], ['cancelled', 'Cancelled']]} />
        <SearchBox value={q} onChange={setQ} placeholder="Invoice no, name or phone (all dates)" style={{ flex: 1, minWidth: 220 }} />
      </div>
      <div className="card card-pad0">
        {loading && !data ? <Spinner center /> : !list.length ? <Empty icon={ReceiptText} title="No invoices">Try another date or clear the search.</Empty> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Invoice</th><th className="hide-sm">Time</th><th>Customer</th><th className="hide-sm">Items</th><th className="num">Total</th><th>Payment</th><th /></tr></thead>
              <tbody>
                {list.map((v) => (
                  <tr key={v._id} style={{ opacity: v.status === 'cancelled' ? 0.5 : 1 }}>
                    <td><button className="btn btn-ghost btn-sm" style={{ padding: 0, height: 'auto', color: 'var(--brand)' }} onClick={() => setView(v._id)}>{v.no}</button></td>
                    <td className="hide-sm small mute">{fDateTime(v.createdAt)}</td>
                    <td>{v.customer?.name || '—'}<div className="tiny mute">{v.customer?.phone}</div></td>
                    <td className="hide-sm small">{v.items.map((i) => i.stationName || i.label).join(', ')}</td>
                    <td className="num b">{inr(v.total)}</td>
                    <td>
                      {v.status === 'pending' ? <span className="badge bad">Pending</span> : v.status === 'cancelled' ? <span className="badge">Cancelled</span> : <span className="badge ok">{MODE_LABEL[v.payment?.mode]}</span>}
                    </td>
                    <td className="right" style={{ whiteSpace: 'nowrap' }}>
                      {v.status === 'pending' && <>
                        <button className="btn btn-sm btn-ok" onClick={() => collect(v, 'cash')} title="Collect in cash"><Banknote /></button>{' '}
                        <button className="btn btn-sm" onClick={() => collect(v, 'online')} title="Collect online"><Smartphone /></button>
                      </>}
                      {isAdmin && v.status !== 'cancelled' && <> <button className="btn btn-sm btn-ghost" onClick={() => cancel(v)} title="Cancel invoice"><Ban /></button></>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {view && <InvoiceModal id={view} onClose={() => setView(null)} />}
    </>
  );
}
