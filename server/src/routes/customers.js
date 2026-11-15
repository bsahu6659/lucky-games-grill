import { Router } from 'express';
import { Customer, Invoice, Plan } from '../models.js';
import { need } from '../auth.js';
import { ah, bad, notFound, log, cleanPhone, money, nextInvoiceNo, getSettings } from '../util.js';
import { emit } from '../events.js';

const r = Router();
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Fast autosuggest for the billing panel (phone or name prefix). */
r.get('/customers/lookup', ah(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  const digits = q.replace(/\D/g, '');
  const filter = digits.length >= 2 && digits.length === q.length ? { phone: new RegExp('^' + esc(digits)) } : { name: new RegExp('^' + esc(q), 'i') };
  res.json(await Customer.find(filter).select('name phone walletBalance walletExpiresAt loyaltyPoints creditDue membershipName').limit(8).lean());
}));

r.get('/customers', need('customers'), ah(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const filter = {};
  if (q) filter.$or = [{ name: new RegExp(esc(q), 'i') }, { phone: new RegExp(esc(q.replace(/\D/g, '') || q)) }];
  if (req.query.filter === 'credit') filter.creditDue = { $gt: 0 };
  if (req.query.filter === 'wallet') filter.walletBalance = { $gt: 0 };
  const sort = { recent: { lastVisitAt: -1 }, spend: { totalSpent: -1 }, visits: { visits: -1 }, name: { name: 1 } }[req.query.sort] || { lastVisitAt: -1 };
  res.json(await Customer.find(filter).sort(sort).limit(Math.min(500, +req.query.limit || 200)).lean());
}));

r.get('/customers/:id', need('customers'), ah(async (req, res) => {
  const c = await Customer.findById(req.params.id).lean();
  if (!c) throw notFound('Customer');
  const invoices = await Invoice.find({ 'customer.id': c._id }).sort({ createdAt: -1 }).limit(50).lean();
  res.json({ customer: c, invoices });
}));

function body(b) {
  const out = {};
  if (b.name !== undefined) out.name = String(b.name).trim().toUpperCase().slice(0, 60) || 'CUSTOMER';
  if (b.note !== undefined) out.note = String(b.note).slice(0, 300);
  return out;
}
r.post('/customers', need('customers'), ah(async (req, res) => {
  const phone = cleanPhone(req.body.phone);
  if (phone.length !== 10) throw bad('Enter a 10-digit phone number');
  if (await Customer.exists({ phone })) throw bad('A customer with this phone already exists');
  const c = await Customer.create({ phone, ...body(req.body) });
  log(req, 'Customer added', `${c.name} ${c.phone}`); emit('customers');
  res.json(c);
}));
r.put('/customers/:id', need('customers'), ah(async (req, res) => {
  const c = await Customer.findByIdAndUpdate(req.params.id, { $set: body(req.body) }, { new: true });
  if (!c) throw notFound('Customer');
  log(req, 'Customer updated', `${c.name} ${c.phone}`); emit('customers');
  res.json(c);
}));

/* ---------------- memberships: plans + wallet recharge ---------------- */
r.get('/plans', ah(async (_req, res) => res.json(await Plan.find().sort({ price: 1 }).lean())));
const planBody = (b) => {
  const out = {};
  if (b.name !== undefined) { if (!String(b.name).trim()) throw bad('Plan name is required'); out.name = String(b.name).trim(); }
  for (const k of ['price', 'credit', 'validityDays']) if (b[k] !== undefined) { if (!(+b[k] >= 0)) throw bad(`Invalid ${k}`); out[k] = +b[k]; }
  if (b.active !== undefined) out.active = !!b.active;
  return out;
};
r.post('/plans', need('memberships'), ah(async (req, res) => {
  const b = planBody(req.body);
  if (!b.name || b.price === undefined || b.credit === undefined) throw bad('Name, price and wallet credit are required');
  const p = await Plan.create(b);
  log(req, 'Membership plan added', `${p.name}: pay ${money(p.price)} get ${money(p.credit)}`);
  res.json(p);
}));
r.put('/plans/:id', need('memberships'), ah(async (req, res) => {
  const p = await Plan.findByIdAndUpdate(req.params.id, { $set: planBody(req.body) }, { new: true });
  if (!p) throw notFound('Plan');
  log(req, 'Membership plan updated', p.name);
  res.json(p);
}));
r.delete('/plans/:id', need('memberships'), ah(async (req, res) => {
  const p = await Plan.findByIdAndDelete(req.params.id);
  if (p) log(req, 'Membership plan deleted', p.name);
  res.json({ ok: true });
}));

r.post('/customers/:id/recharge', need('memberships'), ah(async (req, res) => {
  const [c, plan] = await Promise.all([Customer.findById(req.params.id), Plan.findById(req.body.planId).lean()]);
  if (!c) throw notFound('Customer');
  if (!plan || !plan.active) throw bad('Choose an active plan');
  const mode = req.body.mode === 'online' ? 'online' : 'cash';
  const now = new Date();
  const base = c.walletExpiresAt && c.walletExpiresAt > now ? c.walletExpiresAt : now;
  c.walletBalance = Math.round(((c.walletExpiresAt && c.walletExpiresAt < now ? 0 : c.walletBalance) + plan.credit) * 100) / 100;
  c.walletExpiresAt = new Date(base.getTime() + plan.validityDays * 86400000);
  c.membershipName = plan.name;
  await c.save();
  const s = await getSettings();
  const inv = await Invoice.create({
    no: await nextInvoiceNo(), kind: 'membership',
    items: [{ label: `Membership: ${plan.name} (wallet +${money(plan.credit)}, ${plan.validityDays} days)`, amount: plan.price }],
    subtotal: plan.price, adjustment: 0, taxRate: 0, taxAmount: 0, total: plan.price,
    payment: { mode, cash: mode === 'cash' ? plan.price : 0, online: mode === 'online' ? plan.price : 0, wallet: 0 },
    status: 'paid', paidAt: now, customer: { id: c._id, name: c.name, phone: c.phone },
    createdBy: { id: req.user._id, name: req.user.name }, note: s.shopName,
  });
  log(req, 'Wallet recharge', `${c.name} ${c.phone}: ${plan.name} ${money(plan.price)} → wallet ${money(c.walletBalance)}`);
  emit('customers'); emit('invoices');
  res.json({ customer: c, invoice: inv });
}));

export default r;
