import { Router } from 'express';
import { Station, StationType, Snack, Invoice } from '../models.js';
import { need, can } from '../auth.js';
import { ah, bad, notFound, log, getSettings, dayRange, dayKey } from '../util.js';
import { emit } from '../events.js';
import { elapsedMs, hms, round2 } from '../../../shared/pricing.js';

const r = Router();

export const idleSession = () => ({ state: 'idle', accumulatedMs: 0, players: 1, snacks: [], customer: {}, selected: true });

function hook(url, payload) {
  if (!url || !/^https?:\/\//i.test(url)) return;
  fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(4000),
  }).catch(() => {});
}
const hookOn = (st, event) => hook(st.webhookOn, { event, station: st.name, at: new Date().toISOString() });
const hookOff = (st, event) => hook(st.webhookOff, { event, station: st.name, at: new Date().toISOString() });

/** Sessions whose Stop-timer ran out are ended and sent to billing. */
export async function processAutoStops() {
  const running = await Station.find({ 'session.state': 'running', 'session.stopAtMinutes': { $gt: 0 } });
  let changed = false;
  for (const st of running) {
    const s = st.session;
    const limit = s.stopAtMinutes * 60000;
    if (elapsedMs(s) >= limit) {
      const runStart = new Date(s.lastResumedAt).getTime();
      s.endedAt = new Date(Math.min(Date.now(), runStart + (limit - (s.accumulatedMs || 0))));
      s.accumulatedMs = limit;
      s.state = 'done';
      s.autoStopped = true;
      s.lastResumedAt = undefined;
      await st.save();
      hookOff(st, 'auto-stop');
      log({ user: { name: 'System', role: 'system' } }, 'Auto stop', `${st.name} reached ${s.stopAtMinutes} min`);
      changed = true;
    }
  }
  if (changed) emit('stations');
}

/* ---------- dashboard snapshot ---------- */
r.get('/dashboard', ah(async (req, res) => {
  await processAutoStops();
  const [stations, types, snacks, settings] = await Promise.all([
    Station.find({ active: true }).sort({ order: 1, createdAt: 1 }).select('-webhookOn -webhookOff').lean(),
    StationType.find({ active: true }).sort({ order: 1 }).lean(),
    Snack.find({ active: true }).sort({ category: 1, name: 1 }).lean(),
    getSettings(),
  ]);
  let revenueToday = null;
  if (can(req.user, 'reports')) {
    const [a, b] = dayRange(dayKey());
    const agg = await Invoice.aggregate([
      { $match: { status: 'paid', paidAt: { $gte: a, $lt: b } } },
      { $group: { _id: null, cash: { $sum: '$payment.cash' }, online: { $sum: '$payment.online' } } },
    ]);
    revenueToday = round2((agg[0]?.cash || 0) + (agg[0]?.online || 0));
  }
  res.json({
    serverNow: Date.now(), stations, types, snacks, revenueToday,
    settings: {
      shopName: settings.shopName, tagline: settings.tagline, upiId: settings.upiId, graceMinutes: settings.graceMinutes,
      bonus: settings.bonus, loyalty: settings.loyalty, gst: { enabled: settings.gst?.enabled, rate: settings.gst?.rate },
      lowStockAlert: settings.lowStockAlert, invoiceFooter: settings.invoiceFooter,
    },
  });
}));

/* ---------- per-station actions ---------- */
async function load(id) {
  const st = await Station.findById(id);
  if (!st) throw notFound('Station');
  return st;
}
const done = (req, res, st, action, detail = '') => {
  log(req, action, `${st.name}${detail ? ' — ' + detail : ''}`);
  emit('stations');
  res.json({ ok: true, station: st.toObject() });
};

r.post('/stations/:id/start', ah(async (req, res) => {
  const st = await load(req.params.id);
  if (st.session?.state !== 'idle') throw bad(`${st.name} is already in use`);
  const now = new Date();
  st.session = { ...idleSession(), state: 'running', startedAt: now, lastResumedAt: now, players: Math.max(1, +req.body.players || 1), startedBy: req.user.name };
  await st.save();
  hookOn(st, 'start');
  done(req, res, st, 'Start session');
}));

r.post('/stations/:id/pause', ah(async (req, res) => {
  const st = await load(req.params.id);
  const s = st.session;
  if (s.state !== 'running') throw bad('Session is not running');
  s.accumulatedMs = elapsedMs(s);
  s.lastResumedAt = undefined;
  s.state = 'paused';
  await st.save();
  hookOff(st, 'pause');
  done(req, res, st, 'Pause', hms(s.accumulatedMs));
}));

r.post('/stations/:id/resume', ah(async (req, res) => {
  const st = await load(req.params.id);
  const s = st.session;
  if (s.state !== 'paused') throw bad('Session is not paused');
  s.state = 'running';
  s.lastResumedAt = new Date();
  await st.save();
  hookOn(st, 'resume');
  done(req, res, st, 'Resume');
}));

r.post('/stations/:id/done', ah(async (req, res) => {
  const st = await load(req.params.id);
  const s = st.session;
  if (s.state !== 'running') throw bad(s.state === 'paused' ? 'Resume the session first, then press Done' : 'Session is not running');
  s.accumulatedMs = elapsedMs(s);
  s.lastResumedAt = undefined;
  s.state = 'done';
  s.endedAt = new Date();
  s.selected = true;
  await st.save();
  hookOff(st, 'done');
  done(req, res, st, 'Done → billing', hms(s.accumulatedMs));
}));

r.post('/stations/:id/continue', ah(async (req, res) => {
  const st = await load(req.params.id);
  const s = st.session;
  if (s.state !== 'done') throw bad('Only a finished session can be continued');
  s.state = 'running';
  s.endedAt = undefined;
  s.autoStopped = false;
  if (s.stopAtMinutes && s.accumulatedMs >= s.stopAtMinutes * 60000) s.stopAtMinutes = undefined;
  s.lastResumedAt = new Date();
  await st.save();
  hookOn(st, 'continue');
  done(req, res, st, 'Continue session');
}));

r.post('/stations/:id/reset', need('reset'), ah(async (req, res) => {
  const st = await load(req.params.id);
  const was = st.session?.state;
  const t = hms(elapsedMs(st.session));
  st.session = idleSession();
  await st.save();
  if (was !== 'idle') hookOff(st, 'reset');
  done(req, res, st, 'Reset (no bill)', t);
}));

r.patch('/stations/:id/session', ah(async (req, res) => {
  const st = await load(req.params.id);
  const s = st.session;
  if (s.state === 'idle') throw bad('Start the session first');
  const { players, customer, selected } = req.body;
  if (players !== undefined) {
    const type = await StationType.findById(st.type).lean();
    s.players = Math.min(Math.max(1, +players || 1), type?.rates?.length || 1);
  }
  if (customer) s.customer = { name: String(customer.name || '').slice(0, 60), phone: String(customer.phone || '').replace(/\D/g, '').slice(0, 10), note: String(customer.note || '').slice(0, 200) };
  if (selected !== undefined) s.selected = !!selected;
  st.markModified('session');
  await st.save();
  emit('stations');
  res.json({ ok: true, station: st.toObject() });
}));

r.post('/stations/:id/snack', ah(async (req, res) => {
  const st = await load(req.params.id);
  const s = st.session;
  if (!['running', 'paused'].includes(s.state)) throw bad('Snacks can be added only to an active session');
  const snack = await Snack.findById(req.body.snackId).lean();
  if (!snack) throw notFound('Snack');
  const delta = Math.trunc(+req.body.delta || 0);
  const row = s.snacks.find((x) => String(x.snack) === String(snack._id));
  if (row) row.qty = Math.max(0, row.qty + delta);
  else if (delta > 0) s.snacks.push({ snack: snack._id, name: snack.name, price: snack.price, qty: delta });
  s.snacks = s.snacks.filter((x) => x.qty > 0);
  st.markModified('session');
  await st.save();
  emit('stations');
  res.json({ ok: true, station: st.toObject() });
}));

r.post('/stations/:id/timer', need('editTimer'), ah(async (req, res) => {
  const st = await load(req.params.id);
  const s = st.session;
  if (!['running', 'paused'].includes(s.state)) throw bad('Timer can be edited only on an active session');
  const ms = Math.trunc(+req.body.elapsedMs);
  if (!Number.isFinite(ms) || ms < 0 || ms > 24 * 3600000) throw bad('Enter a valid time (max 24 hours)');
  const before = hms(elapsedMs(s));
  s.accumulatedMs = ms;
  s.startedAt = new Date(Date.now() - ms);
  if (s.state === 'running') s.lastResumedAt = new Date();
  await st.save();
  done(req, res, st, 'Edit timer', `${before} → ${hms(ms)}`);
}));

r.post('/stations/:id/stop-timer', ah(async (req, res) => {
  const st = await load(req.params.id);
  const s = st.session;
  if (!['running', 'paused'].includes(s.state)) throw bad('Start the session first');
  const m = req.body.minutes == null || req.body.minutes === '' ? null : Math.trunc(+req.body.minutes);
  if (m !== null && (!(m > 0) || m > 1440)) throw bad('Minutes must be between 1 and 1440');
  if (m !== null && elapsedMs(s) >= m * 60000) throw bad(`Already played more than ${m} min`);
  s.stopAtMinutes = m || undefined;
  await st.save();
  done(req, res, st, m ? 'Stop timer set' : 'Stop timer cleared', m ? `${m} min` : '');
}));

r.post('/stations/transfer', need('transfer'), ah(async (req, res) => {
  const [from, to] = await Promise.all([load(req.body.from), load(req.body.to)]);
  if (!['running', 'paused'].includes(from.session.state)) throw bad(`${from.name} has no active session`);
  if (to.session.state !== 'idle') throw bad(`${to.name} is not free`);
  const toType = await StationType.findById(to.type).lean();
  const moved = from.session.toObject();
  moved.players = Math.min(moved.players || 1, toType?.rates?.length || 1);
  to.session = moved;
  from.session = idleSession();
  await to.save();
  await from.save();
  hookOff(from, 'transfer-out');
  if (moved.state === 'running') hookOn(to, 'transfer-in');
  log(req, 'Transfer', `${from.name} → ${to.name}`);
  emit('stations');
  res.json({ ok: true });
}));

r.post('/stations/reset-all', need('reset'), ah(async (req, res) => {
  const active = await Station.find({ 'session.state': { $ne: 'idle' } });
  for (const st of active) { st.session = idleSession(); await st.save(); hookOff(st, 'reset-all'); }
  log(req, 'Reset All', `${active.length} station(s) cleared without bill`);
  emit('stations');
  res.json({ ok: true, count: active.length });
}));

export default r;
