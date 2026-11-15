import { Activity, Counter, Settings } from './models.js';

export const TZ = process.env.TZ_NAME || 'Asia/Kolkata';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const bad = (msg) => new HttpError(400, msg);
export const notFound = (what = 'Record') => new HttpError(404, `${what} not found`);

/** Wrap async route handlers so thrown errors reach the error middleware. */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ---------- dates in the shop's timezone ---------- */
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' });
export const dayKey = (d = new Date()) => dayFmt.format(d); // YYYY-MM-DD
export const hourOf = (d) => Number(hourFmt.format(d));

/** UTC offset (ms) of the shop timezone at a given instant. */
function tzOffset(date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date).map((x) => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUTC - Math.floor(date.getTime() / 1000) * 1000;
}
/** [start, end) instants for a YYYY-MM-DD day in shop time. */
export function dayRange(key) {
  const [y, m, d] = key.split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d));
  const start = new Date(guess.getTime() - tzOffset(guess));
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const end = new Date(next.getTime() - tzOffset(next));
  return [start, end];
}
export function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  const first = `${y}-${String(m).padStart(2, '0')}-01`;
  const nm = m === 12 ? [y + 1, 1] : [y, m + 1];
  const nextFirst = `${nm[0]}-${String(nm[1]).padStart(2, '0')}-01`;
  return [dayRange(first)[0], dayRange(nextFirst)[0]];
}
export const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
export const isMonth = (s) => /^\d{4}-\d{2}$/.test(s || '');

/* ---------- settings cache ---------- */
let settingsCache = null;
export async function getSettings() {
  if (!settingsCache) {
    settingsCache = await Settings.findById('shop').lean();
    if (!settingsCache) settingsCache = (await Settings.create({ _id: 'shop' })).toObject();
  }
  return settingsCache;
}
export const clearSettingsCache = () => { settingsCache = null; };

/* ---------- invoice numbers: PREFIX-YYYYMMDD-0001 ---------- */
export async function nextInvoiceNo() {
  const s = await getSettings();
  const day = dayKey().replaceAll('-', '');
  const c = await Counter.findOneAndUpdate({ _id: `inv-${day}` }, { $inc: { seq: 1 } }, { upsert: true, new: true });
  return `${s.invoicePrefix || 'LGG'}-${day}-${String(c.seq).padStart(4, '0')}`;
}

/* ---------- activity timeline ---------- */
export function log(req, action, detail = '') {
  const u = req.user || {};
  Activity.create({ user: { id: u._id, name: u.name, role: u.role }, action, detail }).catch(() => {});
}

export const money = (n) => `₹${(Math.round(n * 100) / 100).toLocaleString('en-IN')}`;
export const cleanPhone = (p) => String(p || '').replace(/\D/g, '').slice(-10);
export const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));
