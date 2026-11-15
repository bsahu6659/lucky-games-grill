import { useEffect, useMemo, useState } from 'react';
import { Banknote, Smartphone, SplitSquareHorizontal, Clock3, WalletCards, Printer, MessageCircle, CheckCircle2, Popcorn, ReceiptText, Gift } from 'lucide-react';
import { billTotals, hms, round2 } from '@shared/pricing.js';
import { get, post } from '../api.js';
import { useAuth, useToast } from '../state.jsx';
import { Modal, Field, Seg, Stepper, CustomerInput, SearchBox, inr, fTime, fDateTime, MODE_LABEL, Spinner } from '../ui.jsx';

/* ---------------- UPI QR (qrcode lib is loaded only when needed) ---------------- */
export function UpiQr({ upiId, shopName, amount, note, size = 168 }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    if (!upiId) return;
    let on = true;
    const url = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(shopName || 'Shop')}&am=${round2(amount).toFixed(2)}&cu=INR&tn=${encodeURIComponent(note || 'Bill')}`;
    import('qrcode').then((Q) => Q.toDataURL(url, { margin: 1, width: size * 2, color: { dark: '#000000', light: '#ffffff' } })).then((d) => on && setSrc(d)).catch(() => {});
    return () => { on = false; };
  }, [upiId, shopName, amount, note, size]);
  if (!upiId) return null;
  return src ? <img src={src} width={size} height={size} alt={`Scan to pay ${inr(amount)} by UPI`} style={{ borderRadius: 10, background: '#fff', padding: 6 }} /> : <div style={{ width: size, height: size }} className="skeleton" />;
}

/* ---------------- payment mode picker ---------------- */
const MODES = [
  ['cash', 'Cash', Banknote], ['online', 'Online / UPI', Smartphone], ['split', 'Split', SplitSquareHorizontal],
  ['credit', 'Pay later', Clock3], ['wallet', 'Wallet', WalletCards],
];
export function PayPicker({ total, customer, value, onChange }) {
  const phoneOk = (customer?.phone || '').length === 10;
  const walletOk = customer?.saved && customer.walletBalance >= total && !(customer.walletExpiresAt && new Date(customer.walletExpiresAt) < new Date());
  const why = { credit: phoneOk ? '' : 'Needs customer phone', wallet: walletOk ? '' : customer?.saved ? `Wallet ${inr(customer.walletBalance || 0)}` : 'Saved customer only' };
  return (
    <div className="col">
      <div className="paymodes">
        {MODES.map(([m, l, I]) => {
          const dis = (m === 'credit' && !phoneOk) || (m === 'wallet' && !walletOk);
          return <button type="button" key={m} className={value.mode === m ? 'on' : ''} disabled={dis} title={why[m] || l} onClick={() => onChange({ ...value, mode: m, cash: m === 'split' ? '' : value.cash, online: '' })}><I />{l}</button>;
        })}
      </div>
      {value.mode === 'split' && (
        <div className="grid2">
          <Field label="Cash ₹"><input className="input" inputMode="decimal" value={value.cash} onChange={(e) => { const c = e.target.value; onChange({ ...value, cash: c, online: c === '' ? '' : String(round2(Math.max(0, total - (+c || 0)))) }); }} /></Field>
          <Field label="Online ₹"><input className="input" inputMode="decimal" value={value.online} onChange={(e) => onChange({ ...value, online: e.target.value })} /></Field>
        </div>
      )}
      {value.mode === 'credit' && <div className="small mute">Bill goes to <b>Pending</b>. Collect it later from Invoices or Daily Revenue.</div>}
      {value.mode === 'wallet' && <div className="small mute">{inr(total)} will be deducted from the wallet (balance {inr(customer?.walletBalance || 0)}).</div>}
    </div>
  );
}
const payBody = (p) => ({ mode: p.mode, cash: +p.cash || 0, online: +p.online || 0 });

/* ---------------- printable receipt ---------------- */
export function Receipt({ invoice: v, shop }) {
  return (
    <div className="receipt print-area">
      <div className="center">
        <h3 style={{ fontSize: 17, fontWeight: 900 }}>{shop?.name || 'Lucky Games & Grill'}</h3>
        {shop?.tagline && <div className="mute small">{shop.tagline}</div>}
        {shop?.address && <div className="small">{shop.address}</div>}
        {shop?.phone && <div className="small">Ph: {shop.phone}</div>}
        {shop?.gst?.enabled && shop.gst.gstin && <div className="small">GSTIN: {shop.gst.gstin}</div>}
        <div className="small b mt8">{shop?.gst?.enabled ? 'TAX INVOICE' : 'BILL OF SUPPLY'}</div>
      </div>
      <div className="line" />
      <div className="small">
        <div className="row"><span>Invoice</span><span className="sp" /><b>{v.no}</b></div>
        <div className="row"><span>Date</span><span className="sp" />{fDateTime(v.createdAt)}</div>
        {(v.customer?.name || v.customer?.phone) && <div className="row"><span>Customer</span><span className="sp" />{v.customer.name} {v.customer.phone || ''}</div>}
      </div>
      <div className="line" />
      <table className="small"><tbody>
        {v.items.map((it, i) => (
          <tr key={i}><td>
            <b>{it.label}</b>{it.typeName && <span className="mute"> · {it.typeName}</span>}
            {it.playedMs != null && <div className="mute">{fTime(it.start)}–{fTime(it.end)} · played {hms(it.playedMs)}</div>}
            {it.units != null && <div>{it.players}P × {it.units} × {it.block}min @ {inr(it.rate)} = {inr(it.base)}{it.bonusMinutes ? ` (bonus ${it.bonusMinutes}m free)` : ''}</div>}
            {(it.snacks || []).map((s, j) => <div key={j}>{s.name} × {s.qty} = {inr(s.qty * s.price)}</div>)}
          </td><td className="right b" style={{ whiteSpace: 'nowrap' }}>{inr(it.amount)}</td></tr>
        ))}
      </tbody></table>
      <div className="line" />
      <table className="small"><tbody>
        <tr><td>Subtotal</td><td className="right">{inr(v.subtotal)}</td></tr>
        {!!v.adjustment && <tr><td>{v.adjustment < 0 ? 'Discount' : 'Adjustment'}{v.discountMode === 'percent' ? ` (${v.discountValue}%)` : ''}</td><td className="right">{inr(v.adjustment)}</td></tr>}
        {!!v.loyaltyAmount && <tr><td>Loyalty ({v.loyaltyPoints} pts)</td><td className="right">-{inr(v.loyaltyAmount)}</td></tr>}
        {!!v.taxAmount && <><tr><td>CGST {v.taxRate / 2}%</td><td className="right">{inr(v.taxAmount / 2)}</td></tr><tr><td>SGST {v.taxRate / 2}%</td><td className="right">{inr(v.taxAmount / 2)}</td></tr></>}
      </tbody></table>
      <div className="row tot mt8"><span>TOTAL</span><span className="sp" /><span>{inr(v.total)}</span></div>
      <div className="small mt8">Paid by: <b>{MODE_LABEL[v.payment?.mode] || '—'}</b>{v.payment?.mode === 'split' && ` (Cash ${inr(v.payment.cash)} + Online ${inr(v.payment.online)})`}
        {v.status === 'pending' && <b> · PENDING</b>}{v.status === 'cancelled' && <b> · CANCELLED</b>}</div>
      <div className="line" />
      <div className="center small">{shop?.footer || 'Thank you! Visit again.'}</div>
    </div>
  );
}

export function whatsappLink(v, shopName) {
  const lines = [
    `*${shopName || 'Lucky Games & Grill'}*`, `Invoice ${v.no}`, fDateTime(v.createdAt), '',
    ...v.items.map((it) => `${it.label}: ${inr(it.amount)}`),
    v.adjustment ? `Discount: ${inr(v.adjustment)}` : null, v.loyaltyAmount ? `Loyalty: -${inr(v.loyaltyAmount)}` : null,
    v.taxAmount ? `GST: ${inr(v.taxAmount)}` : null, `*Total: ${inr(v.total)}* (${MODE_LABEL[v.payment?.mode] || ''}${v.status === 'pending' ? ', pending' : ''})`, '', 'Thank you for playing with us! 🎮🍔',
  ].filter((x) => x !== null);
  const phone = v.customer?.phone ? `91${v.customer.phone}` : '';
  return `https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`;
}

/** Shows a saved invoice with Print + WhatsApp actions. */
export function InvoiceModal({ id, onClose, title = 'Invoice' }) {
  const [d, setD] = useState(null);
  const toast = useToast();
  useEffect(() => { get(`/invoices/${id}`).then(setD).catch((e) => toast(e.message, 'bad')); }, [id, toast]);
  return (
    <Modal title={title} icon={ReceiptText} onClose={onClose}
      footer={d && <>
        <a className="btn" href={whatsappLink(d.invoice, d.shop.name)} target="_blank" rel="noreferrer"><MessageCircle />WhatsApp</a>
        <button className="btn" onClick={() => window.print()}><Printer />Print</button>
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      </>}>
      {d ? <Receipt invoice={d.invoice} shop={d.shop} /> : <Spinner center />}
    </Modal>
  );
}

/* ---------------- checkout for finished sessions ---------------- */
export function CheckoutModal({ request, onClose, onPaid }) {
  const toast = useToast();
  const [draft, setDraft] = useState(null);
  const [pay, setPay] = useState({ mode: 'cash', cash: '', online: '' });
  const [busy, setBusy] = useState(false);
  const [paid, setPaid] = useState(null);

  useEffect(() => {
    post('/billing/preview', request).then(setDraft).catch((e) => { toast(e.message, 'bad'); onClose(); });
  }, [request]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    setBusy(true);
    try {
      const r = await post('/billing/checkout', { ...request, payment: payBody(pay) });
      toast(r.invoice.status === 'pending' ? 'Saved on credit (pending)' : `Paid ✓ ${inr(r.invoice.total)}`);
      setPaid(r.invoice._id);
      onPaid?.();
    } catch (e) { toast(e.message, 'bad'); }
    setBusy(false);
  };

  if (paid) return <InvoiceModal id={paid} onClose={onClose} title="Bill saved" />;
  const t = draft?.totals;
  return (
    <Modal title="Checkout" icon={ReceiptText} size="wide" onClose={onClose}
      footer={draft && <>
        <button className="btn" onClick={onClose}>Back</button>
        <button className="btn btn-primary btn-lg" disabled={busy} onClick={submit}><CheckCircle2 />{busy ? 'Saving…' : pay.mode === 'credit' ? `Save on credit · ${inr(t.total)}` : `Mark as Paid · ${inr(t.total)}`}</button>
      </>}>
      {!draft ? <Spinner center /> : (
        <div className="grid2" style={{ alignItems: 'start', gap: 18 }}>
          <div className="col">
            <h3>Bill summary</h3>
            {draft.items.map((it) => (
              <div key={it.stationName} className="bcard">
                <div className="row"><b>{it.stationName}</b><span className="badge">{it.typeName}</span><span className="sp" /><b className="num">{inr(it.amount)}</b></div>
                <div className="small mute">{fTime(it.start)}–{fTime(it.end)} · played {hms(it.playedMs)}</div>
                <div className="small">{it.players}P × {it.units} × {it.block}m @ {inr(it.rate)} = {inr(it.base)}{it.bonusMinutes ? ` · bonus ${it.bonusMinutes}m` : ''}</div>
                {it.snacks?.length > 0 && <div className="small">{it.snacks.map((s) => `${s.name}×${s.qty}`).join(', ')} = {inr(it.snackTotal)}</div>}
              </div>
            ))}
            <div className="small col gap4">
              <div className="row"><span>Subtotal</span><span className="sp" />{inr(t.subtotal)}</div>
              {!!t.adjustment && <div className="row"><span>{t.adjustment < 0 ? 'Discount' : 'Adjustment'}</span><span className="sp" />{inr(t.adjustment)}</div>}
              {!!t.loyalty && <div className="row"><span>Loyalty points</span><span className="sp" />-{inr(t.loyalty)}</div>}
              {!!t.taxAmount && <div className="row"><span>GST {draft.shop.gst?.rate}%</span><span className="sp" />{inr(t.taxAmount)}</div>}
            </div>
            <div className="total-box"><span className="b">Total</span><b>{inr(t.total)}</b></div>
            {draft.customer.phone && <div className="small mute">Customer: <b>{draft.customer.name || '—'}</b> {draft.customer.phone}{draft.customer.saved ? ` · ${draft.customer.loyaltyPoints} pts · wallet ${inr(draft.customer.walletBalance)}` : ' · new customer'}</div>}
          </div>
          <div className="col gap12">
            <h3>Payment</h3>
            <PayPicker total={t.total} customer={draft.customer} value={pay} onChange={setPay} />
            {(pay.mode === 'online' || pay.mode === 'split') && draft.shop.upiId && (
              <div className="row gap12" style={{ alignItems: 'center' }}>
                <UpiQr upiId={draft.shop.upiId} shopName={draft.shop.name} amount={pay.mode === 'split' ? +pay.online || 0 : t.total} note="Gaming bill" size={132} />
                <div className="small mute">Customer scans this QR to pay <b>{inr(pay.mode === 'split' ? +pay.online || 0 : t.total)}</b> to {draft.shop.upiId}</div>
              </div>
            )}
            {(pay.mode === 'online') && !draft.shop.upiId && <div className="small faint">Tip: add your UPI ID in Shop Details to show a pay-QR here.</div>}
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ---------------- Snacks Sale (walk-in, no station) ---------------- */
export function SnackSaleModal({ snacks, settings, onClose }) {
  const { can } = useAuth();
  const toast = useToast();
  const [qty, setQty] = useState({});
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [cust, setCust] = useState({ phone: '', name: '', customer: null });
  const [disc, setDisc] = useState('');
  const [pay, setPay] = useState({ mode: 'cash', cash: '', online: '' });
  const [busy, setBusy] = useState(false);
  const [paid, setPaid] = useState(null);

  const cats = useMemo(() => ['All', ...new Set(snacks.map((s) => s.category || 'Snacks'))], [snacks]);
  const shown = snacks.filter((s) => (cat === 'All' || s.category === cat) && s.name.toLowerCase().includes(q.toLowerCase()));
  const subtotal = round2(snacks.reduce((a, s) => a + (qty[s._id] || 0) * s.price, 0));
  const count = Object.values(qty).reduce((a, b) => a + b, 0);
  const totals = billTotals({ subtotal, discount: { mode: 'amount', value: -(Math.abs(+disc) || 0) }, tax: settings?.gst });
  const customer = { phone: cust.phone, saved: !!cust.customer, walletBalance: cust.customer?.walletBalance || 0, walletExpiresAt: cust.customer?.walletExpiresAt };

  const submit = async () => {
    setBusy(true);
    try {
      const r = await post('/billing/snacks-sale', {
        items: Object.entries(qty).filter(([, n]) => n > 0).map(([snackId, n]) => ({ snackId, qty: n })),
        discount: { mode: 'amount', value: -(Math.abs(+disc) || 0) }, customer: { phone: cust.phone, name: cust.name }, payment: payBody(pay),
      });
      toast(`Snacks billed ✓ ${inr(r.invoice.total)}`);
      setPaid(r.invoice._id);
    } catch (e) { toast(e.message, 'bad'); }
    setBusy(false);
  };
  if (paid) return <InvoiceModal id={paid} onClose={onClose} title="Snacks bill saved" />;

  return (
    <Modal title="Snacks Sale" icon={Popcorn} size="wide" onClose={onClose}
      footer={<><span className="mute small" style={{ marginRight: 'auto' }}>{count} item(s)</span>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-lg" disabled={!count || busy} onClick={submit}><CheckCircle2 />{busy ? 'Saving…' : `Generate Bill · ${inr(totals.total)}`}</button></>}>
      <div className="grid2" style={{ alignItems: 'start', gap: 18 }}>
        <div className="col">
          <div className="small mute">Walk-in / external customer — no station needed.</div>
          <SearchBox value={q} onChange={setQ} placeholder="Search menu…" />
          <div className="filters" style={{ marginBottom: 0 }}>{cats.map((c) => <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}</div>
          <div className="snacklist" style={{ maxHeight: 340 }}>
            {shown.map((s) => {
              const out = s.trackStock && s.stock <= 0;
              return (
                <div key={s._id} className={`snackrow ${qty[s._id] ? 'has' : ''}`}>
                  <span className="n">{s.name} <span className="p">{inr(s.price)}{s.trackStock && <> · {out ? <span style={{ color: 'var(--bad)' }}>out of stock</span> : `${s.stock} left`}</>}</span></span>
                  <Stepper value={qty[s._id] || 0} onChange={(n) => setQty({ ...qty, [s._id]: Math.max(0, n) })} />
                </div>
              );
            })}
            {!shown.length && <div className="mute small">No items</div>}
          </div>
        </div>
        <div className="col gap12">
          <Field label="Customer" hint="optional"><CustomerInput phone={cust.phone} name={cust.name} onChange={setCust} /></Field>
          {can('discount') && <Field label="Discount ₹" hint="optional"><input className="input" inputMode="decimal" placeholder="0" value={disc} onChange={(e) => setDisc(e.target.value.replace(/[^\d.]/g, ''))} /></Field>}
          <div className="small col gap4">
            <div className="row"><span>Subtotal</span><span className="sp" />{inr(totals.subtotal)}</div>
            {!!totals.adjustment && <div className="row"><span>Discount</span><span className="sp" />{inr(totals.adjustment)}</div>}
            {!!totals.taxAmount && <div className="row"><span>GST</span><span className="sp" />{inr(totals.taxAmount)}</div>}
          </div>
          <div className="total-box"><span className="b">Total</span><b>{inr(totals.total)}</b></div>
          <PayPicker total={totals.total} customer={customer} value={pay} onChange={setPay} />
          {pay.mode === 'online' && settings?.upiId && totals.total > 0 && <div className="row gap12"><UpiQr upiId={settings.upiId} shopName={settings.shopName} amount={totals.total} note="Snacks" size={120} /><span className="small mute">Scan to pay {inr(totals.total)}</span></div>}
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- Billing side panel (finished sessions) ---------------- */
export function BillingPanel({ done, types, settings, onCheckout }) {
  const { can } = useAuth();
  const [off, setOff] = useState(() => new Set()); // de-selected station ids
  const [discount, setDiscount] = useState({ mode: 'amount', value: '' });
  const [cust, setCust] = useState({ phone: '', name: '', customer: null });
  const [redeem, setRedeem] = useState(false);

  useEffect(() => { // forget de-selections of stations that left billing
    setOff((s) => new Set([...s].filter((id) => done.some((d) => d._id === id))));
  }, [done]);
  useEffect(() => { // pick up the customer typed on the station card
    if (!cust.phone && !cust.name) {
      const c = done.find((d) => d.session.customer?.phone || d.session.customer?.name)?.session.customer;
      if (c) setCust({ phone: c.phone || '', name: (c.name || '').toUpperCase(), customer: null });
    }
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  const sel = done.filter((d) => !off.has(d._id));
  const lines = sel.map((d) => d.charge);
  const subtotal = round2(lines.reduce((a, c) => a + c.amount, 0));
  const L = settings?.loyalty || {};
  const pts = cust.customer?.loyaltyPoints || 0;
  const canRedeem = L.enabled && pts >= (L.minRedeem || 0) && pts > 0;
  const redeemPts = redeem && canRedeem ? Math.min(pts, Math.floor(subtotal / (L.pointValue || 1))) : 0;
  const totals = billTotals({ subtotal, discount: { mode: discount.mode, value: discount.mode === 'percent' ? Math.abs(+discount.value || 0) : +discount.value || 0 }, loyaltyAmount: redeemPts * (L.pointValue || 1), tax: settings?.gst });
  const phoneBad = cust.phone && cust.phone.length !== 10;

  const go = () => {
    onCheckout({
      stationIds: sel.map((d) => d._id),
      discount: { mode: discount.mode, value: discount.mode === 'percent' ? Math.abs(+discount.value || 0) : +discount.value || 0 },
      customer: { phone: cust.phone, name: cust.name }, redeemPoints: redeemPts,
    }, () => { setDiscount({ mode: 'amount', value: '' }); setCust({ phone: '', name: '', customer: null }); setRedeem(false); });
  };

  if (!done.length) {
    return (
      <div className="card billing">
        <div className="row"><ReceiptText size={18} color="var(--orange)" /><h2>Billing</h2></div>
        <div className="empty" style={{ padding: '26px 8px' }}><ReceiptText /><div className="b" style={{ color: 'var(--ink)' }}>No finished sessions</div><div className="small mt8">Press <b>Done</b> on a station — its bill card appears here. You can combine several seats into one invoice.</div></div>
      </div>
    );
  }
  return (
    <div className="card billing">
      <div className="row"><ReceiptText size={18} color="var(--orange)" /><h2>Billing</h2><span className="sp" />
        <button className="btn btn-ghost btn-sm" onClick={() => setOff(off.size ? new Set() : new Set(done.map((d) => d._id)))}>{off.size ? 'Select all' : 'Unselect all'}</button></div>
      <div className="small mute" style={{ marginTop: -6 }}>{sel.length} of {done.length} selected · tick seats to combine into one bill</div>
      {done.map((d) => {
        const on = !off.has(d._id);
        return (
          <label key={d._id} className={`bcard ${on ? 'sel' : ''}`} style={{ cursor: 'pointer' }}>
            <div className="row">
              <input type="checkbox" checked={on} style={{ width: 18, height: 18, accentColor: 'var(--orange)' }} onChange={() => { const s = new Set(off); on ? s.add(d._id) : s.delete(d._id); setOff(s); }} />
              <b>{d.name}</b><span className="badge brand">DONE</span>{d.session.autoStopped && <span className="badge warn">auto-stop</span>}<span className="sp" /><b className="num">{inr(d.charge.amount)}</b>
            </div>
            <div className="small mute">{fTime(d.session.startedAt)}–{fTime(d.session.endedAt)} · played {hms(d.session.accumulatedMs)}</div>
            <div className="small">{d.charge.players}P × {d.charge.units} × {d.charge.block}m = {inr(d.charge.base)}{d.charge.snackTotal ? ` + snacks ${inr(d.charge.snackTotal)}` : ''}</div>
            <div className="row" style={{ gap: 6 }} onClick={(e) => e.preventDefault()}>
              <button className="btn btn-sm" onClick={() => d.onContinue()}>↩ Continue</button>
              {can('reset') && <button className="btn btn-sm btn-danger" onClick={() => d.onReset()}>Reset</button>}
            </div>
          </label>
        );
      })}

      {can('discount') && (
        <Field label="Discount / adjustment" hint={discount.mode === 'percent' ? '0–100% off' : '−₹ discount, +₹ extra'}>
          <div className="row">
            <Seg value={discount.mode} options={[['amount', '₹'], ['percent', '%']]} onChange={(m) => setDiscount({ mode: m, value: '' })} />
            <input className="input" inputMode="decimal" placeholder={discount.mode === 'percent' ? 'e.g. 10' : 'e.g. -50'} value={discount.value}
              onChange={(e) => setDiscount({ ...discount, value: e.target.value.replace(discount.mode === 'percent' ? /[^\d.]/g : /[^\d.-]/g, '') })} />
          </div>
        </Field>
      )}
      <Field label="Customer" hint="phone shows past customers"><CustomerInput phone={cust.phone} name={cust.name} onChange={(c) => { setCust(c); setRedeem(false); }} /></Field>
      {cust.customer && (
        <div className="row wrap small" style={{ gap: 6 }}>
          {cust.customer.walletBalance > 0 && <span className="badge info"><WalletCards />Wallet {inr(cust.customer.walletBalance)}</span>}
          {L.enabled && <span className="badge brand"><Gift />{pts} pts</span>}
          {cust.customer.creditDue > 0 && <span className="badge bad">Due {inr(cust.customer.creditDue)}</span>}
        </div>
      )}
      {canRedeem && <label className="check small"><input type="checkbox" checked={redeem} onChange={(e) => setRedeem(e.target.checked)} />Redeem {Math.min(pts, Math.floor(subtotal / (L.pointValue || 1)))} points (−{inr(Math.min(pts, Math.floor(subtotal / (L.pointValue || 1))) * (L.pointValue || 1))})</label>}
      <div className="small col gap4">
        <div className="row"><span>Subtotal</span><span className="sp" />{inr(totals.subtotal)}</div>
        {!!totals.adjustment && <div className="row"><span>{totals.adjustment < 0 ? 'Discount' : 'Adjustment'}</span><span className="sp" />{inr(totals.adjustment)}</div>}
        {!!totals.loyalty && <div className="row"><span>Loyalty</span><span className="sp" />-{inr(totals.loyalty)}</div>}
        {!!totals.taxAmount && <div className="row"><span>GST {settings.gst.rate}%</span><span className="sp" />{inr(totals.taxAmount)}</div>}
      </div>
      <div className="total-box"><span className="b">Final total</span><b>{inr(totals.total)}</b></div>
      <button className="btn btn-primary btn-lg btn-block" disabled={!sel.length || phoneBad} onClick={go}><ReceiptText />Generate Invoice</button>
      {phoneBad && <div className="small" style={{ color: 'var(--bad)' }}>Phone must be 10 digits</div>}
    </div>
  );
}
