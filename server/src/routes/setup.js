import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Settings, StationType, Station, Snack, User } from '../models.js';
import { need, adminOnly, dropUserCache, publicUser } from '../auth.js';
import { ah, bad, notFound, log, getSettings, clearSettingsCache, pick } from '../util.js';
import { emit } from '../events.js';
import { PERMISSIONS } from '../../../shared/pricing.js';
import { idleSession } from './stations.js';

const r = Router();
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);

/* ---------------- shop settings ---------------- */
r.get('/settings', ah(async (_req, res) => res.json(await getSettings())));

r.put('/settings', adminOnly, ah(async (req, res) => {
  const b = req.body || {};
  const set = pick(b, ['shopName', 'tagline', 'address', 'phone', 'email', 'upiId', 'invoicePrefix', 'invoiceFooter']);
  if (set.shopName !== undefined && !String(set.shopName).trim()) throw bad('Shop name is required');
  if (set.invoicePrefix !== undefined) set.invoicePrefix = String(set.invoicePrefix).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'LGG';
  if (b.graceMinutes !== undefined) set.graceMinutes = Math.max(0, Math.min(30, num(b.graceMinutes)));
  if (b.lowStockAlert !== undefined) set.lowStockAlert = Math.max(0, num(b.lowStockAlert));
  if (b.gst) set.gst = { enabled: !!b.gst.enabled, gstin: String(b.gst.gstin || '').toUpperCase().slice(0, 15), rate: Math.max(0, Math.min(28, num(b.gst.rate, 18))) };
  if (b.bonus) set.bonus = { enabled: !!b.bonus.enabled, afterMinutes: Math.max(1, num(b.bonus.afterMinutes, 120)), freeMinutes: Math.max(0, num(b.bonus.freeMinutes, 15)) };
  if (b.loyalty) set.loyalty = { enabled: !!b.loyalty.enabled, pointsPer100: Math.max(0, num(b.loyalty.pointsPer100, 5)), pointValue: Math.max(0, num(b.loyalty.pointValue, 1)), minRedeem: Math.max(0, num(b.loyalty.minRedeem, 50)) };
  const s = await Settings.findByIdAndUpdate('shop', { $set: set }, { new: true, upsert: true }).lean();
  clearSettingsCache();
  log(req, 'Settings updated', Object.keys(set).join(', '));
  emit('settings'); emit('stations');
  res.json(s);
}));

/* ---------------- station types = Rate Card ---------------- */
r.get('/types', ah(async (_req, res) => res.json(await StationType.find().sort({ order: 1, createdAt: 1 }).lean())));

function typeBody(b) {
  const out = pick(b, ['name', 'icon']);
  if (out.name !== undefined && !String(out.name).trim()) throw bad('Type name is required');
  if (b.blockMinutes !== undefined) out.blockMinutes = Math.max(1, Math.min(240, Math.trunc(num(b.blockMinutes, 30))));
  if (b.rates !== undefined) {
    const rates = (Array.isArray(b.rates) ? b.rates : []).map((x) => Math.max(0, num(x))).slice(0, 8);
    if (!rates.length) throw bad('Add at least the 1-player rate');
    out.rates = rates;
  }
  if (b.order !== undefined) out.order = num(b.order);
  if (b.active !== undefined) out.active = !!b.active;
  return out;
}
r.post('/types', need('setup'), ah(async (req, res) => {
  const t = await StationType.create(typeBody(req.body));
  log(req, 'Station type added', t.name); emit('stations');
  res.json(t);
}));
r.put('/types/:id', need('setup'), ah(async (req, res) => {
  const t = await StationType.findByIdAndUpdate(req.params.id, { $set: typeBody(req.body) }, { new: true, runValidators: true });
  if (!t) throw notFound('Station type');
  log(req, 'Rate card updated', `${t.name}: ${t.rates.map((x, i) => `${i + 1}P ₹${x}`).join(', ')} / ${t.blockMinutes} min`);
  emit('stations');
  res.json(t);
}));
r.delete('/types/:id', need('setup'), ah(async (req, res) => {
  const used = await Station.countDocuments({ type: req.params.id });
  if (used) throw bad(`${used} station(s) use this type — move or delete them first`);
  const t = await StationType.findByIdAndDelete(req.params.id);
  if (t) log(req, 'Station type deleted', t.name);
  emit('stations');
  res.json({ ok: true });
}));

/* ---------------- stations = Manage Resources ---------------- */
r.get('/stations', need('setup'), ah(async (_req, res) => res.json(await Station.find().sort({ order: 1, createdAt: 1 }).lean())));

function stationBody(b) {
  const out = pick(b, ['name', 'type']);
  if (out.name !== undefined && !String(out.name).trim()) throw bad('Station name is required');
  if (b.order !== undefined) out.order = num(b.order);
  if (b.active !== undefined) out.active = !!b.active;
  for (const k of ['webhookOn', 'webhookOff']) {
    if (b[k] !== undefined) {
      const v = String(b[k] || '').trim();
      if (v && !/^https?:\/\/\S+$/i.test(v)) throw bad('Webhook must be an http(s) URL');
      out[k] = v;
    }
  }
  return out;
}
r.post('/stations', need('setup'), ah(async (req, res) => {
  const b = stationBody(req.body);
  if (!b.type || !(await StationType.exists({ _id: b.type }))) throw bad('Choose a station type');
  const count = Math.max(1, Math.min(20, Math.trunc(num(req.body.count, 1))));
  const last = await Station.findOne().sort({ order: -1 }).lean();
  let order = (last?.order || 0) + 1;
  const docs = [];
  for (let i = 0; i < count; i++) docs.push({ ...b, name: count > 1 ? `${b.name} ${i + 1}` : b.name, order: order++, session: idleSession() });
  const created = await Station.insertMany(docs);
  log(req, 'Station added', created.map((x) => x.name).join(', ')); emit('stations');
  res.json(created);
}));
r.put('/stations/:id', need('setup'), ah(async (req, res) => {
  const b = stationBody(req.body);
  if (b.type) {
    const st = await Station.findById(req.params.id).lean();
    if (st && st.session?.state !== 'idle' && String(st.type) !== String(b.type)) throw bad('Finish the running session before changing the type');
  }
  const st = await Station.findByIdAndUpdate(req.params.id, { $set: b }, { new: true });
  if (!st) throw notFound('Station');
  log(req, 'Station updated', st.name); emit('stations');
  res.json(st);
}));
r.post('/stations/:id/new-link', need('setup'), ah(async (req, res) => {
  const st = await Station.findByIdAndUpdate(req.params.id, { $set: { publicToken: crypto.randomBytes(9).toString('base64url') } }, { new: true });
  if (!st) throw notFound('Station');
  log(req, 'Live view link reset', st.name);
  res.json(st);
}));
r.delete('/stations/:id', need('setup'), ah(async (req, res) => {
  const st = await Station.findById(req.params.id);
  if (!st) throw notFound('Station');
  if (st.session?.state !== 'idle') throw bad('Bill or reset the session before deleting this station');
  await st.deleteOne();
  log(req, 'Station deleted', st.name); emit('stations');
  res.json({ ok: true });
}));

/* ---------------- snacks & stock ---------------- */
r.get('/snacks', ah(async (_req, res) => res.json(await Snack.find().sort({ category: 1, name: 1 }).lean())));

function snackBody(b) {
  const out = pick(b, ['name', 'category']);
  if (out.name !== undefined && !String(out.name).trim()) throw bad('Item name is required');
  if (b.price !== undefined) { if (!(num(b.price, -1) >= 0)) throw bad('Enter a valid price'); out.price = num(b.price); }
  if (b.stock !== undefined) out.stock = Math.trunc(num(b.stock));
  if (b.trackStock !== undefined) out.trackStock = !!b.trackStock;
  if (b.active !== undefined) out.active = !!b.active;
  return out;
}
r.post('/snacks', need('setup'), ah(async (req, res) => {
  const b = snackBody(req.body);
  if (b.price === undefined) throw bad('Enter a price');
  const s = await Snack.create(b);
  log(req, 'Snack added', `${s.name} ₹${s.price}`); emit('snacks');
  res.json(s);
}));
r.put('/snacks/:id', need('setup'), ah(async (req, res) => {
  const s = await Snack.findByIdAndUpdate(req.params.id, { $set: snackBody(req.body) }, { new: true });
  if (!s) throw notFound('Snack');
  log(req, 'Snack updated', `${s.name} ₹${s.price}`); emit('snacks');
  res.json(s);
}));
r.post('/snacks/:id/stock', need('setup'), ah(async (req, res) => {
  const delta = Math.trunc(num(req.body.delta));
  if (!delta) throw bad('Enter a quantity');
  const s = await Snack.findByIdAndUpdate(req.params.id, { $inc: { stock: delta } }, { new: true });
  if (!s) throw notFound('Snack');
  log(req, delta > 0 ? 'Restock' : 'Stock write-off', `${s.name} ${delta > 0 ? '+' : ''}${delta}${req.body.note ? ' — ' + String(req.body.note).slice(0, 80) : ''} (now ${s.stock})`);
  emit('snacks');
  res.json(s);
}));
r.delete('/snacks/:id', need('setup'), ah(async (req, res) => {
  const s = await Snack.findByIdAndDelete(req.params.id);
  if (s) log(req, 'Snack deleted', s.name);
  emit('snacks');
  res.json({ ok: true });
}));

/* ---------------- staff = Manage Staff (owner only) ---------------- */
const VALID = new Set(PERMISSIONS.map((p) => p[0]));
const cleanPerms = (p) => [...new Set((Array.isArray(p) ? p : []).filter((x) => VALID.has(x)))];

r.get('/users', adminOnly, ah(async (_req, res) => {
  const users = await User.find().sort({ role: 1, name: 1 }).lean();
  res.json(users.map((u) => ({ ...publicUser(u), active: u.active, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt })));
}));

r.post('/users', adminOnly, ah(async (req, res) => {
  const { name, username, password, role, phone } = req.body || {};
  if (!String(name || '').trim()) throw bad('Name is required');
  if (!/^[a-z0-9._-]{3,30}$/i.test(username || '')) throw bad('Login ID: 3–30 letters, numbers, . _ -');
  if (String(password || '').length < 6) throw bad('Password must be at least 6 characters');
  if (await User.exists({ username: String(username).toLowerCase() })) throw bad('This login ID is already taken');
  const u = await User.create({
    name: String(name).trim(), username, phone, role: role === 'admin' ? 'admin' : 'staff',
    permissions: cleanPerms(req.body.permissions), passwordHash: await bcrypt.hash(password, 10),
  });
  log(req, 'Staff added', `${u.name} (${u.username}, ${u.role})`);
  res.json(publicUser(u));
}));

r.put('/users/:id', adminOnly, ah(async (req, res) => {
  const u = await User.findById(req.params.id).select('+passwordHash');
  if (!u) throw notFound('User');
  const b = req.body || {};
  const self = String(u._id) === String(req.user._id);
  if (b.name !== undefined) { if (!String(b.name).trim()) throw bad('Name is required'); u.name = String(b.name).trim(); }
  if (b.phone !== undefined) u.phone = b.phone;
  if (b.permissions !== undefined) u.permissions = cleanPerms(b.permissions);
  if (b.role !== undefined && !self) u.role = b.role === 'admin' ? 'admin' : 'staff';
  if (b.active !== undefined) { if (self && !b.active) throw bad('You cannot disable your own account'); u.active = !!b.active; }
  if (b.password) { if (String(b.password).length < 6) throw bad('Password must be at least 6 characters'); u.passwordHash = await bcrypt.hash(b.password, 10); }
  await u.save();
  dropUserCache(u._id);
  log(req, 'Staff updated', `${u.name}${b.password ? ' (password reset)' : ''}`);
  res.json(publicUser(u));
}));

r.delete('/users/:id', adminOnly, ah(async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) throw bad('You cannot delete your own account');
  const u = await User.findById(req.params.id);
  if (!u) throw notFound('User');
  if (u.role === 'admin' && (await User.countDocuments({ role: 'admin', active: true })) <= 1) throw bad('Keep at least one active admin');
  await u.deleteOne();
  dropUserCache(u._id);
  log(req, 'Staff deleted', u.name);
  res.json({ ok: true });
}));

export default r;
