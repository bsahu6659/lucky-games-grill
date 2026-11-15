import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { Expense, Booking, Tournament, Station, StationType, User } from '../models.js';
import { need, signToken, loginGuard, publicUser, requireAuth } from '../auth.js';
import { ah, bad, notFound, log, isDay, isMonth, dayKey, cleanPhone, money, getSettings } from '../util.js';
import { emit } from '../events.js';
import { elapsedMs, sessionCharge } from '../../../shared/pricing.js';

/* ======================= public (no login) ======================= */
export const publicRouter = Router();

publicRouter.post('/auth/login', loginGuard, ah(async (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!username || !password) throw bad('Enter login ID and password');
  const u = await User.findOne({ username }).select('+passwordHash');
  if (!u || !(await bcrypt.compare(password, u.passwordHash))) throw bad('Wrong login ID or password');
  if (!u.active) throw bad('This account is disabled — ask the owner');
  u.lastLoginAt = new Date();
  await u.save();
  req.clearLoginTries?.();
  log({ user: u }, 'Login', `${u.name} (${u.role})`);
  res.json({ token: signToken(u), user: publicUser(u) });
}));

publicRouter.get('/public/shop', ah(async (_req, res) => {
  const s = await getSettings();
  res.json({ shopName: s.shopName, tagline: s.tagline });
}));

/** Live Session View — customer scans the station QR and sees time + running bill. */
publicRouter.get('/public/live/:token', ah(async (req, res) => {
  const st = await Station.findOne({ publicToken: req.params.token, active: true }).lean();
  if (!st) throw notFound('Station');
  const [type, settings] = await Promise.all([StationType.findById(st.type).lean(), getSettings()]);
  const s = st.session || {};
  const ms = elapsedMs(s);
  const c = s.state === 'idle' ? null : sessionCharge({ ms, players: s.players, snacks: s.snacks, type, settings });
  res.json({
    serverNow: Date.now(), shopName: settings.shopName, station: st.name, type: type?.name,
    state: s.state, accumulatedMs: s.accumulatedMs, lastResumedAt: s.lastResumedAt, startedAt: s.startedAt,
    stopAtMinutes: s.stopAtMinutes, players: s.players, snacks: (s.snacks || []).map((x) => ({ name: x.name, qty: x.qty, price: x.price })),
    rates: type?.rates, blockMinutes: type?.blockMinutes, graceMinutes: settings.graceMinutes, bonus: settings.bonus,
    charge: c, firstName: (s.customer?.name || '').split(' ')[0] || null, upiId: settings.upiId,
  });
}));

/* ======================= logged-in ======================= */
const r = Router();

r.get('/auth/me', ah(async (req, res) => {
  const s = await getSettings();
  res.json({ user: publicUser(req.user), shop: { shopName: s.shopName, tagline: s.tagline } });
}));

r.post('/auth/password', ah(async (req, res) => {
  const u = await User.findById(req.user._id).select('+passwordHash');
  if (!(await bcrypt.compare(String(req.body.current || ''), u.passwordHash))) throw bad('Current password is wrong');
  if (String(req.body.next || '').length < 6) throw bad('New password must be at least 6 characters');
  u.passwordHash = await bcrypt.hash(req.body.next, 10);
  await u.save();
  log(req, 'Password changed', u.name);
  res.json({ ok: true });
}));

/* ---------- Expenses & other income ---------- */
r.get('/expenses', need('expenses'), ah(async (req, res) => {
  const m = isMonth(req.query.month) ? req.query.month : dayKey().slice(0, 7);
  res.json(await Expense.find({ date: { $gte: `${m}-01`, $lte: `${m}-31` } }).sort({ date: -1, createdAt: -1 }).lean());
}));
function expenseBody(b) {
  const out = {};
  if (b.kind !== undefined) out.kind = b.kind === 'income' ? 'income' : 'expense';
  if (b.date !== undefined) { if (!isDay(b.date)) throw bad('Pick a date'); out.date = b.date; }
  if (b.category !== undefined) out.category = String(b.category || 'Other').trim().slice(0, 40) || 'Other';
  if (b.amount !== undefined) { if (!(+b.amount > 0)) throw bad('Amount must be more than 0'); out.amount = +b.amount; }
  if (b.mode !== undefined) out.mode = b.mode === 'online' ? 'online' : 'cash';
  if (b.note !== undefined) out.note = String(b.note).slice(0, 200);
  return out;
}
r.post('/expenses', need('expenses'), ah(async (req, res) => {
  const b = expenseBody({ kind: 'expense', date: dayKey(), ...req.body });
  if (!b.amount) throw bad('Enter an amount');
  const e = await Expense.create({ ...b, createdBy: { id: req.user._id, name: req.user.name } });
  log(req, e.kind === 'income' ? 'Income added' : 'Expense added', `${e.category} ${money(e.amount)}`); emit('expenses');
  res.json(e);
}));
r.put('/expenses/:id', need('expenses'), ah(async (req, res) => {
  const e = await Expense.findByIdAndUpdate(req.params.id, { $set: expenseBody(req.body) }, { new: true });
  if (!e) throw notFound('Entry');
  log(req, 'Expense updated', `${e.category} ${money(e.amount)}`); emit('expenses');
  res.json(e);
}));
r.delete('/expenses/:id', need('expenses'), ah(async (req, res) => {
  const e = await Expense.findByIdAndDelete(req.params.id);
  if (e) log(req, 'Expense deleted', `${e.category} ${money(e.amount)}`);
  emit('expenses');
  res.json({ ok: true });
}));

/* ---------- Advance Bookings ---------- */
r.get('/bookings', need('bookings'), ah(async (req, res) => {
  const q = {};
  if (isDay(req.query.date)) q.date = req.query.date;
  else if (req.query.upcoming) q.date = { $gte: dayKey() };
  if (req.query.status) q.status = req.query.status;
  res.json(await Booking.find(q).sort({ date: 1, time: 1 }).limit(300).populate('stationType', 'name').populate('station', 'name').lean());
}));
function bookingBody(b) {
  const out = {};
  if (b.customerName !== undefined) { if (!String(b.customerName).trim()) throw bad('Customer name is required'); out.customerName = String(b.customerName).trim().toUpperCase(); }
  if (b.phone !== undefined) { const p = cleanPhone(b.phone); if (p.length !== 10) throw bad('Enter a 10-digit phone number'); out.phone = p; }
  if (b.date !== undefined) { if (!isDay(b.date)) throw bad('Pick a date'); out.date = b.date; }
  if (b.time !== undefined) { if (!/^\d{2}:\d{2}$/.test(b.time)) throw bad('Pick a time'); out.time = b.time; }
  if (b.durationMinutes !== undefined) out.durationMinutes = Math.max(15, Math.min(720, +b.durationMinutes || 60));
  if (b.players !== undefined) out.players = Math.max(1, Math.min(20, +b.players || 1));
  if (b.stationType !== undefined) out.stationType = b.stationType || undefined;
  if (b.station !== undefined) out.station = b.station || undefined;
  if (b.status !== undefined) {
    if (!['pending', 'confirmed', 'arrived', 'completed', 'cancelled', 'no-show'].includes(b.status)) throw bad('Invalid status');
    out.status = b.status;
  }
  if (b.note !== undefined) out.note = String(b.note).slice(0, 200);
  return out;
}
async function clash(b, ignoreId) {
  if (!b.station || !b.date || !b.time) return;
  const toMin = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
  const s1 = toMin(b.time); const e1 = s1 + (b.durationMinutes || 60);
  const same = await Booking.find({ station: b.station, date: b.date, status: { $in: ['pending', 'confirmed', 'arrived'] }, _id: { $ne: ignoreId } }).lean();
  const hit = same.find((x) => { const s2 = toMin(x.time); const e2 = s2 + (x.durationMinutes || 60); return s1 < e2 && s2 < e1; });
  if (hit) throw bad(`This station is already booked at ${hit.time} for ${hit.customerName}`);
}
r.post('/bookings', need('bookings'), ah(async (req, res) => {
  const b = bookingBody({ status: 'confirmed', ...req.body });
  for (const k of ['customerName', 'phone', 'date', 'time']) if (!b[k]) throw bad('Name, phone, date and time are required');
  await clash(b);
  const bk = await Booking.create({ ...b, createdBy: { id: req.user._id, name: req.user.name } });
  log(req, 'Booking added', `${bk.customerName} ${bk.date} ${bk.time}`); emit('bookings');
  res.json(bk);
}));
r.put('/bookings/:id', need('bookings'), ah(async (req, res) => {
  const cur = await Booking.findById(req.params.id).lean();
  if (!cur) throw notFound('Booking');
  const b = bookingBody(req.body);
  await clash({ ...cur, ...b }, cur._id);
  const bk = await Booking.findByIdAndUpdate(req.params.id, { $set: b }, { new: true });
  log(req, 'Booking updated', `${bk.customerName} ${bk.date} ${bk.time} → ${bk.status}`); emit('bookings');
  res.json(bk);
}));
r.delete('/bookings/:id', need('bookings'), ah(async (req, res) => {
  const bk = await Booking.findByIdAndDelete(req.params.id);
  if (bk) log(req, 'Booking deleted', `${bk.customerName} ${bk.date} ${bk.time}`);
  emit('bookings');
  res.json({ ok: true });
}));

/* ---------- Tournaments ---------- */
r.get('/tournaments', need('tournaments'), ah(async (_req, res) => res.json(await Tournament.find().sort({ date: -1 }).lean())));
function tourBody(b) {
  const out = {};
  for (const k of ['name', 'game', 'time', 'rules']) if (b[k] !== undefined) out[k] = String(b[k]).trim().slice(0, k === 'rules' ? 1000 : 80);
  if (b.date !== undefined) { if (!isDay(b.date)) throw bad('Pick a date'); out.date = b.date; }
  for (const k of ['entryFee', 'prizePool', 'maxPlayers']) if (b[k] !== undefined) out[k] = Math.max(0, +b[k] || 0);
  if (b.status !== undefined) out.status = ['upcoming', 'live', 'completed', 'cancelled'].includes(b.status) ? b.status : 'upcoming';
  if (b.winners !== undefined) out.winners = (Array.isArray(b.winners) ? b.winners : []).filter((w) => w.name).slice(0, 5).map((w, i) => ({ place: +w.place || i + 1, name: String(w.name).slice(0, 60), prize: Math.max(0, +w.prize || 0) }));
  return out;
}
r.post('/tournaments', need('tournaments'), ah(async (req, res) => {
  const b = tourBody(req.body);
  if (!b.name || !b.game || !b.date) throw bad('Name, game and date are required');
  const t = await Tournament.create(b);
  log(req, 'Tournament created', `${t.name} (${t.game}) ${t.date}`); emit('tournaments');
  res.json(t);
}));
r.put('/tournaments/:id', need('tournaments'), ah(async (req, res) => {
  const prev = await Tournament.findById(req.params.id).lean();
  if (!prev) throw notFound('Tournament');
  const b = tourBody(req.body);
  const t = await Tournament.findByIdAndUpdate(req.params.id, { $set: b }, { new: true });
  // prize payouts are recorded as expenses the first time winners are saved with prizes
  if (b.winners && !(prev.winners || []).length) {
    for (const w of t.winners.filter((x) => x.prize > 0)) {
      await Expense.create({ kind: 'expense', date: dayKey(), category: 'Tournament prize', amount: w.prize, note: `${t.name}: #${w.place} ${w.name}`, createdBy: { id: req.user._id, name: req.user.name } });
    }
  }
  log(req, 'Tournament updated', `${t.name} → ${t.status}`); emit('tournaments'); emit('expenses');
  res.json(t);
}));
r.delete('/tournaments/:id', need('tournaments'), ah(async (req, res) => {
  const t = await Tournament.findByIdAndDelete(req.params.id);
  if (t) log(req, 'Tournament deleted', t.name);
  emit('tournaments');
  res.json({ ok: true });
}));
r.post('/tournaments/:id/participants', need('tournaments'), ah(async (req, res) => {
  const t = await Tournament.findById(req.params.id);
  if (!t) throw notFound('Tournament');
  const name = String(req.body.name || '').trim();
  if (!name) throw bad('Player name is required');
  if (t.participants.length >= t.maxPlayers) throw bad(`Only ${t.maxPlayers} places`);
  t.participants.push({ name: name.toUpperCase(), phone: cleanPhone(req.body.phone), team: String(req.body.team || '').slice(0, 40) });
  await t.save();
  log(req, 'Tournament entry', `${t.name}: ${name}`); emit('tournaments');
  res.json(t);
}));
r.put('/tournaments/:id/participants/:pid', need('tournaments'), ah(async (req, res) => {
  const t = await Tournament.findById(req.params.id);
  if (!t) throw notFound('Tournament');
  const p = t.participants.id(req.params.pid);
  if (!p) throw notFound('Player');
  if (req.body.checkedIn !== undefined) p.checkedIn = !!req.body.checkedIn;
  if (req.body.paid && !p.paid && t.entryFee > 0) {
    p.paid = true; p.mode = req.body.mode === 'online' ? 'online' : 'cash';
    await Expense.create({ kind: 'income', date: dayKey(), category: 'Tournament entry', amount: t.entryFee, mode: p.mode, note: `${t.name}: ${p.name}`, createdBy: { id: req.user._id, name: req.user.name } });
    log(req, 'Entry fee collected', `${t.name}: ${p.name} ${money(t.entryFee)} (${p.mode})`);
  } else if (req.body.paid && t.entryFee === 0) p.paid = true;
  await t.save();
  emit('tournaments'); emit('expenses');
  res.json(t);
}));
r.delete('/tournaments/:id/participants/:pid', need('tournaments'), ah(async (req, res) => {
  const t = await Tournament.findById(req.params.id);
  if (!t) throw notFound('Tournament');
  const p = t.participants.id(req.params.pid);
  if (p?.paid && t.entryFee > 0) throw bad('Entry fee already collected — refund it from Expenses first, then remove');
  p?.deleteOne();
  await t.save();
  emit('tournaments');
  res.json(t);
}));

export default r;
export { requireAuth };
