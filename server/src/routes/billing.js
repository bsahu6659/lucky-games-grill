import { Router } from 'express';
import { Station, StationType, Snack, Customer, Invoice } from '../models.js';
import { need, can, adminOnly } from '../auth.js';
import { ah, bad, notFound, log, getSettings, nextInvoiceNo, cleanPhone, money, dayRange, isDay, HttpError } from '../util.js';
import { emit } from '../events.js';
import { sessionCharge, billTotals, round2 } from '../../../shared/pricing.js';
import { idleSession } from './stations.js';

const r = Router();

/* ---------------- helpers ---------------- */
async function findCustomer(phone) {
  const p = cleanPhone(phone);
  return p.length === 10 ? Customer.findOne({ phone: p }).lean() : null;
}

function loyaltyFor(settings, customer, redeemPoints) {
  const L = settings.loyalty || {};
  const pts = Math.trunc(+redeemPoints || 0);
  if (!pts) return { points: 0, amount: 0 };
  if (!L.enabled) throw bad('Loyalty program is switched off');
  if (!customer) throw bad('Select a saved customer to redeem points');
  if (pts > (customer.loyaltyPoints || 0)) throw bad(`Customer has only ${customer.loyaltyPoints || 0} points`);
  if (pts < (L.minRedeem || 0)) throw bad(`Minimum ${L.minRedeem} points to redeem`);
  return { points: pts, amount: round2(pts * (L.pointValue || 1)) };
}

/** Build invoice lines + totals for a set of finished sessions. */
async function draftForSessions(body, user) {
  const ids = Array.isArray(body.stationIds) ? body.stationIds : [];
  if (!ids.length) throw bad('Select at least one finished session');
  const [stations, settings] = await Promise.all([
    Station.find({ _id: { $in: ids }, 'session.state': 'done' }).lean(),
    getSettings(),
  ]);
  if (stations.length !== ids.length) throw bad('Some sessions were already billed or are not finished — refresh and try again');
  const types = new Map((await StationType.find({ _id: { $in: stations.map((s) => s.type) } }).lean()).map((t) => [String(t._id), t]));
  const items = stations.map((st) => {
    const s = st.session;
    const type = types.get(String(st.type));
    const c = sessionCharge({ ms: s.accumulatedMs, players: s.players, snacks: s.snacks, type, settings });
    return {
      label: st.name, stationName: st.name, typeName: type?.name, start: s.startedAt, end: s.endedAt,
      playedMs: s.accumulatedMs, players: c.players, units: c.units, block: c.block, rate: c.rate, base: c.base,
      bonusMinutes: c.bonusMinutes, snacks: (s.snacks || []).map((x) => ({ name: x.name, qty: x.qty, price: x.price, snack: x.snack })),
      snackTotal: c.snackTotal, amount: c.amount, customer: s.customer,
    };
  });
  return finishDraft({ items, body, settings, user, kind: 'session' });
}

async function draftForSnacks(body, user) {
  const lines = (Array.isArray(body.items) ? body.items : []).filter((x) => +x.qty > 0);
  if (!lines.length) throw bad('Add at least one item');
  const [snacks, settings] = await Promise.all([
    Snack.find({ _id: { $in: lines.map((x) => x.snackId) }, active: true }).lean(),
    getSettings(),
  ]);
  const map = new Map(snacks.map((s) => [String(s._id), s]));
  const sn = lines.map((x) => {
    const s = map.get(String(x.snackId));
    if (!s) throw bad('An item is no longer on the menu — refresh');
    return { snack: s._id, name: s.name, price: s.price, qty: Math.trunc(+x.qty) };
  });
  const snackTotal = round2(sn.reduce((a, x) => a + x.price * x.qty, 0));
  const items = [{ label: 'Snacks sale (walk-in)', snacks: sn, snackTotal, amount: snackTotal }];
  return finishDraft({ items, body, settings, user, kind: 'snacks' });
}

async function finishDraft({ items, body, settings, user, kind }) {
  const subtotal = round2(items.reduce((a, x) => a + x.amount, 0));
  const discount = { mode: body.discount?.mode === 'percent' ? 'percent' : 'amount', value: +body.discount?.value || 0 };
  if (discount.value && !can(user, 'discount')) throw new HttpError(403, 'You do not have permission to give discounts');
  const phone = cleanPhone(body.customer?.phone);
  if (body.customer?.phone && phone.length !== 10) throw bad('Customer phone must be 10 digits');
  const customer = await findCustomer(phone);
  const loyalty = loyaltyFor(settings, customer, body.redeemPoints);
  const totals = billTotals({ subtotal, discount, loyaltyAmount: loyalty.amount, tax: settings.gst });
  return {
    kind, items, discount, loyalty, totals, settings,
    customer: {
      id: customer?._id, phone, name: (body.customer?.name || customer?.name || '').trim().toUpperCase(),
      walletBalance: customer?.walletBalance || 0, walletExpiresAt: customer?.walletExpiresAt,
      loyaltyPoints: customer?.loyaltyPoints || 0, creditDue: customer?.creditDue || 0, saved: !!customer,
    },
  };
}

function checkPayment(p = {}, total, d) {
  const mode = p.mode;
  if (!['cash', 'online', 'split', 'credit', 'wallet'].includes(mode)) throw bad('Choose a payment mode');
  if (mode === 'cash') return { mode, cash: total, online: 0, wallet: 0 };
  if (mode === 'online') return { mode, cash: 0, online: total, wallet: 0 };
  if (mode === 'split') {
    const cash = round2(+p.cash || 0); const online = round2(+p.online || 0);
    if (cash < 0 || online < 0 || Math.abs(cash + online - total) > 0.01) throw bad(`Cash + Online must equal ${money(total)}`);
    return { mode, cash, online, wallet: 0 };
  }
  if (mode === 'credit') {
    if (d.customer.phone.length !== 10) throw bad('Credit (pay later) needs the customer phone number');
    return { mode, cash: 0, online: 0, wallet: 0 };
  }
  // wallet
  if (!d.customer.saved) throw bad('Wallet payment needs a saved customer');
  if (d.customer.walletExpiresAt && new Date(d.customer.walletExpiresAt) < new Date()) throw bad('Customer wallet has expired');
  if (d.customer.walletBalance < total) throw bad(`Wallet balance is only ${money(d.customer.walletBalance)}`);
  return { mode, cash: 0, online: 0, wallet: total };
}

const publicDraft = (d) => ({
  kind: d.kind, items: d.items, discount: d.discount, loyalty: d.loyalty, totals: d.totals, customer: d.customer,
  shop: { name: d.settings.shopName, gst: d.settings.gst, upiId: d.settings.upiId },
});

/** Persist the invoice and the customer / stock side effects. */
async function commit(d, payment, req) {
  const { totals } = d;
  const status = payment.mode === 'credit' ? 'pending' : 'paid';
  const L = d.settings.loyalty || {};

  // customer: create on first visit, update stats
  let customerId = d.customer.id;
  if (d.customer.phone.length === 10) {
    const earn = status === 'paid' && L.enabled && payment.mode !== 'wallet' ? Math.floor((totals.total / 100) * (L.pointsPer100 || 0)) : 0;
    const inc = { visits: 1, totalSpent: totals.total, loyaltyPoints: earn - (d.loyalty.points || 0) };
    if (status === 'pending') inc.creditDue = totals.total;
    if (payment.mode === 'wallet') inc.walletBalance = -totals.total;
    const filter = { phone: d.customer.phone };
    if (payment.mode === 'wallet') filter.walletBalance = { $gte: totals.total };
    if (d.loyalty.points) filter.loyaltyPoints = { $gte: d.loyalty.points };
    const set = { lastVisitAt: new Date() };
    if (d.customer.name) set.name = d.customer.name;
    const c = await Customer.findOneAndUpdate(filter, { $inc: inc, $set: set }, { new: true, upsert: !d.customer.saved && payment.mode !== 'wallet' && !d.loyalty.points }).catch((e) => {
      if (e.code === 11000) throw bad('Wallet or points changed meanwhile — try again');
      throw e;
    });
    if (!c) throw bad('Wallet or points balance changed — refresh and try again');
    customerId = c._id;
  }

  const invoice = await Invoice.create({
    no: await nextInvoiceNo(), kind: d.kind,
    items: d.items.map(({ customer, ...x }) => ({ ...x, snacks: (x.snacks || []).map(({ snack, ...s }) => s) })),
    subtotal: totals.subtotal, discountMode: d.discount.mode, discountValue: d.discount.value, adjustment: totals.adjustment,
    loyaltyPoints: d.loyalty.points, loyaltyAmount: totals.loyalty,
    taxRate: d.settings.gst?.enabled ? d.settings.gst.rate : 0, taxAmount: totals.taxAmount, total: totals.total,
    payment, status, paidAt: status === 'paid' ? new Date() : undefined,
    customer: { id: customerId, name: d.customer.name || (d.customer.phone ? 'CUSTOMER' : 'WALK-IN'), phone: d.customer.phone || undefined },
    createdBy: { id: req.user._id, name: req.user.name },
  });

  // stock: deduct every sold snack that tracks stock
  const qty = new Map();
  for (const it of d.items) for (const s of it.snacks || []) if (s.snack) qty.set(String(s.snack), (qty.get(String(s.snack)) || 0) + s.qty);
  if (qty.size) {
    await Snack.bulkWrite([...qty].map(([id, q]) => ({ updateOne: { filter: { _id: id, trackStock: true }, update: { $inc: { stock: -q } } } })));
  }
  return invoice;
}

/* ---------------- routes ---------------- */
r.post('/billing/preview', need('billing'), ah(async (req, res) => {
  res.json(publicDraft(await draftForSessions(req.body, req.user)));
}));

r.post('/billing/checkout', need('billing'), ah(async (req, res) => {
  const d = await draftForSessions(req.body, req.user);
  const payment = checkPayment(req.body.payment, d.totals.total, d);
  const ids = req.body.stationIds;
  // claim the sessions atomically so two counters can't bill the same seat twice
  const claimed = [];
  for (const id of ids) {
    const old = await Station.findOneAndUpdate({ _id: id, 'session.state': 'done' }, { $set: { session: idleSession() } }, { new: false });
    if (old) claimed.push(old);
  }
  if (claimed.length !== ids.length) {
    for (const old of claimed) await Station.updateOne({ _id: old._id }, { $set: { session: old.session } });
    throw bad('These sessions were billed from another screen — refresh');
  }
  let invoice;
  try {
    invoice = await commit(d, payment, req);
  } catch (e) {
    for (const old of claimed) await Station.updateOne({ _id: old._id }, { $set: { session: old.session } });
    throw e;
  }
  log(req, status(invoice), `${invoice.no} · ${claimed.map((s) => s.name).join(', ')} · ${money(invoice.total)} (${payment.mode})`);
  emit('stations'); emit('invoices');
  res.json({ ok: true, invoice });
}));

const status = (inv) => (inv.status === 'pending' ? 'Invoice on credit' : 'Invoice paid');

r.post('/billing/snacks-sale', need('snacksSale'), ah(async (req, res) => {
  const d = await draftForSnacks(req.body, req.user);
  if (req.body.previewOnly) return res.json(publicDraft(d));
  const payment = checkPayment(req.body.payment, d.totals.total, d);
  const invoice = await commit(d, payment, req);
  log(req, 'Snacks sale', `${invoice.no} · ${money(invoice.total)} (${payment.mode})`);
  emit('invoices'); emit('snacks');
  res.json({ ok: true, invoice });
}));

/* ---------------- invoice history ---------------- */
r.get('/invoices', need('billing'), ah(async (req, res) => {
  const q = {};
  if (isDay(req.query.date)) {
    const [a, b] = dayRange(req.query.date);
    q.$or = [{ createdAt: { $gte: a, $lt: b } }, { paidAt: { $gte: a, $lt: b } }];
  }
  if (['paid', 'pending', 'cancelled'].includes(req.query.status)) q.status = req.query.status;
  if (req.query.customer) q['customer.id'] = req.query.customer;
  if (req.query.q) {
    const s = String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    q.$and = [{ $or: [{ no: new RegExp(s, 'i') }, { 'customer.name': new RegExp(s, 'i') }, { 'customer.phone': new RegExp(s) }] }];
  }
  const limit = Math.min(200, +req.query.limit || 100);
  const list = await Invoice.find(q).sort({ createdAt: -1 }).limit(limit).lean();
  res.json(list);
}));

r.get('/invoices/:id', need('billing'), ah(async (req, res) => {
  const inv = await Invoice.findById(req.params.id).lean();
  if (!inv) throw notFound('Invoice');
  const s = await getSettings();
  res.json({ invoice: inv, shop: { name: s.shopName, tagline: s.tagline, address: s.address, phone: s.phone, upiId: s.upiId, gst: s.gst, footer: s.invoiceFooter } });
}));

r.post('/invoices/:id/collect', need('billing'), ah(async (req, res) => {
  const mode = req.body.mode === 'online' ? 'online' : 'cash';
  const pending = await Invoice.findOne({ _id: req.params.id, status: 'pending' }).lean();
  if (!pending) throw bad('Invoice is not pending');
  const payment = { mode, cash: mode === 'cash' ? pending.total : 0, online: mode === 'online' ? pending.total : 0, wallet: 0 };
  const inv = await Invoice.findOneAndUpdate(
    { _id: pending._id, status: 'pending' },
    { $set: { status: 'paid', paidAt: new Date(), payment } },
    { new: true },
  );
  if (!inv) throw bad('Invoice was collected from another screen');
  if (inv.customer?.id) {
    const s = await getSettings();
    const earn = s.loyalty?.enabled ? Math.floor((inv.total / 100) * (s.loyalty.pointsPer100 || 0)) : 0;
    await Customer.updateOne({ _id: inv.customer.id }, { $inc: { creditDue: -inv.total, loyaltyPoints: earn } });
  }
  log(req, 'Credit collected', `${inv.no} · ${money(inv.total)} (${mode})`);
  emit('invoices');
  res.json({ ok: true, invoice: inv });
}));

r.post('/invoices/:id/cancel', adminOnly, ah(async (req, res) => {
  const inv = await Invoice.findById(req.params.id);
  if (!inv) throw notFound('Invoice');
  if (inv.status === 'cancelled') throw bad('Already cancelled');
  const was = inv.status;
  inv.status = 'cancelled';
  inv.note = String(req.body.reason || '').slice(0, 200);
  await inv.save();
  if (inv.customer?.id) {
    const inc = { totalSpent: -inv.total, visits: -1, loyaltyPoints: inv.loyaltyPoints || 0 };
    if (was === 'pending') inc.creditDue = -inv.total;
    if (inv.payment?.wallet) inc.walletBalance = inv.payment.wallet;
    await Customer.updateOne({ _id: inv.customer.id }, { $inc: inc });
  }
  log(req, 'Invoice cancelled', `${inv.no} · ${money(inv.total)}${inv.note ? ' — ' + inv.note : ''}`);
  emit('invoices');
  res.json({ ok: true });
}));

export default r;
