import { Router } from 'express';
import { Invoice, Expense, Customer, Snack, Activity } from '../models.js';
import { need } from '../auth.js';
import { ah, bad, dayKey, dayRange, monthRange, isDay, isMonth, hourOf, TZ, getSettings } from '../util.js';
import { round2 } from '../../../shared/pricing.js';

const r = Router();
r.use('/reports', need('reports'));

const sumBy = (list, f) => round2(list.reduce((a, x) => a + (f(x) || 0), 0));

/* ---------- Daily Revenue ---------- */
r.get('/reports/daily', ah(async (req, res) => {
  const day = isDay(req.query.date) ? req.query.date : dayKey();
  const [a, b] = dayRange(day);
  const [paid, created, pendingAll, extra] = await Promise.all([
    Invoice.find({ status: 'paid', paidAt: { $gte: a, $lt: b } }).lean(),
    Invoice.find({ createdAt: { $gte: a, $lt: b } }).sort({ createdAt: -1 }).lean(),
    Invoice.find({ status: 'pending' }).sort({ createdAt: -1 }).lean(),
    Expense.find({ date: day }).lean(),
  ]);
  const cash = sumBy(paid, (x) => x.payment?.cash);
  const online = sumBy(paid, (x) => x.payment?.online);
  const live = created.filter((x) => x.status !== 'cancelled');
  const income = sumBy(extra.filter((x) => x.kind === 'income'), (x) => x.amount);
  const expenses = sumBy(extra.filter((x) => x.kind === 'expense'), (x) => x.amount);
  res.json({
    date: day,
    kpis: {
      collected: round2(cash + online), cash, online,
      walletUsed: sumBy(live, (x) => x.payment?.wallet),
      billed: sumBy(live.filter((x) => x.kind !== 'membership'), (x) => x.total),
      memberships: sumBy(live.filter((x) => x.kind === 'membership'), (x) => x.total),
      discounts: sumBy(live, (x) => Math.max(0, -(x.adjustment || 0)) + (x.loyaltyAmount || 0)),
      tax: sumBy(live, (x) => x.taxAmount),
      invoices: live.length,
      creditGiven: sumBy(live.filter((x) => x.status === 'pending'), (x) => x.total),
      pendingAll: sumBy(pendingAll, (x) => x.total),
      income, expenses, net: round2(cash + online + income - expenses),
    },
    invoices: created,
    collectedToday: paid.filter((x) => x.createdAt < a),
    pending: pendingAll,
  });
}));

/* ---------- Monthly Revenue ---------- */
r.get('/reports/monthly', ah(async (req, res) => {
  const month = isMonth(req.query.month) ? req.query.month : dayKey().slice(0, 7);
  const [a, b] = monthRange(month);
  const [paid, created, extra] = await Promise.all([
    Invoice.find({ status: 'paid', paidAt: { $gte: a, $lt: b } }).select('paidAt payment').lean(),
    Invoice.find({ createdAt: { $gte: a, $lt: b }, status: { $ne: 'cancelled' } }).select('createdAt total taxAmount subtotal adjustment loyaltyAmount kind').lean(),
    Expense.find({ date: { $gte: `${month}-01`, $lte: `${month}-31` } }).lean(),
  ]);
  const days = {};
  const row = (k) => (days[k] ||= { date: k, collected: 0, cash: 0, online: 0, billed: 0, expenses: 0, income: 0 });
  for (const x of paid) { const d = row(dayKey(x.paidAt)); d.cash += x.payment?.cash || 0; d.online += x.payment?.online || 0; d.collected += (x.payment?.cash || 0) + (x.payment?.online || 0); }
  for (const x of created) if (x.kind !== 'membership') row(dayKey(x.createdAt)).billed += x.total || 0;
  for (const x of extra) row(x.date)[x.kind === 'income' ? 'income' : 'expenses'] += x.amount;
  const list = Object.values(days).map((d) => ({ ...d, collected: round2(d.collected), cash: round2(d.cash), online: round2(d.online), billed: round2(d.billed), expenses: round2(d.expenses), income: round2(d.income) })).sort((x, y) => x.date.localeCompare(y.date));
  const t = (k) => sumBy(list, (x) => x[k]);
  const byCategory = {};
  for (const x of extra.filter((e) => e.kind === 'expense')) byCategory[x.category] = round2((byCategory[x.category] || 0) + x.amount);
  res.json({
    month, days: list, byCategory,
    totals: {
      collected: t('collected'), cash: t('cash'), online: t('online'), billed: t('billed'), expenses: t('expenses'), income: t('income'),
      net: round2(t('collected') + t('income') - t('expenses')),
      taxable: sumBy(created, (x) => (x.total || 0) - (x.taxAmount || 0)), tax: sumBy(created, (x) => x.taxAmount),
    },
  });
}));

/* ---------- System Usage ---------- */
function rangeFromQuery(q) {
  const to = isDay(q.to) ? q.to : dayKey();
  const from = isDay(q.from) ? q.from : dayKey(new Date(Date.now() - 6 * 86400000));
  if (from > to) throw bad('From date is after To date');
  return [from, to, dayRange(from)[0], dayRange(to)[1]];
}
r.get('/reports/usage', ah(async (req, res) => {
  const [from, to, a, b] = rangeFromQuery(req.query);
  const inv = await Invoice.find({ kind: 'session', status: { $ne: 'cancelled' }, createdAt: { $gte: a, $lt: b } }).select('items createdAt').lean();
  const byType = {}; const byStation = {}; const hours = Array(24).fill(0); const byDay = {};
  let sessions = 0; let playMs = 0;
  for (const i of inv) for (const it of i.items || []) {
    sessions += 1; playMs += it.playedMs || 0;
    const t = (byType[it.typeName || 'Other'] ||= { name: it.typeName || 'Other', sessions: 0, hours: 0, revenue: 0 });
    t.sessions += 1; t.hours += (it.playedMs || 0) / 3600000; t.revenue += it.base || 0;
    const s = (byStation[it.stationName || '?'] ||= { name: it.stationName || '?', sessions: 0, hours: 0, revenue: 0 });
    s.sessions += 1; s.hours += (it.playedMs || 0) / 3600000; s.revenue += it.base || 0;
    if (it.start) hours[hourOf(new Date(it.start))] += 1;
    const d = dayKey(i.createdAt); byDay[d] = (byDay[d] || 0) + 1;
  }
  const fix = (o) => Object.values(o).map((x) => ({ ...x, hours: round2(x.hours), revenue: round2(x.revenue) })).sort((x, y) => y.revenue - x.revenue);
  const peak = hours.indexOf(Math.max(...hours));
  res.json({
    from, to, sessions, playHours: round2(playMs / 3600000), avgMinutes: sessions ? Math.round(playMs / sessions / 60000) : 0,
    peakHour: sessions ? peak : null, hours, byType: fix(byType), byStation: fix(byStation),
    byDay: Object.entries(byDay).map(([date, n]) => ({ date, sessions: n })).sort((x, y) => x.date.localeCompare(y.date)),
  });
}));

/* ---------- Snacks Report ---------- */
r.get('/reports/snacks', ah(async (req, res) => {
  const [from, to, a, b] = rangeFromQuery(req.query);
  const [inv, snacks, settings] = await Promise.all([
    Invoice.find({ status: { $ne: 'cancelled' }, createdAt: { $gte: a, $lt: b }, 'items.snacks.0': { $exists: true } }).select('items').lean(),
    Snack.find().lean(),
    getSettings(),
  ]);
  const sold = {};
  for (const i of inv) for (const it of i.items || []) for (const s of it.snacks || []) {
    const row = (sold[s.name] ||= { name: s.name, qty: 0, revenue: 0 });
    row.qty += s.qty; row.revenue += s.qty * s.price;
  }
  const low = settings.lowStockAlert ?? 5;
  res.json({
    from, to,
    sold: Object.values(sold).map((x) => ({ ...x, revenue: round2(x.revenue) })).sort((x, y) => y.qty - x.qty),
    stock: snacks.map((s) => ({ _id: s._id, name: s.name, stock: s.stock, trackStock: s.trackStock, active: s.active, low: s.trackStock && s.stock <= low })),
  });
}));

/* ---------- Activity Timeline ---------- */
r.get('/reports/activity', ah(async (req, res) => {
  const day = isDay(req.query.date) ? req.query.date : dayKey();
  const [a, b] = dayRange(day);
  const q = { at: { $gte: a, $lt: b } };
  if (req.query.q) q.$or = [{ action: new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { detail: new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { 'user.name': new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }];
  res.json({ date: day, tz: TZ, items: await Activity.find(q).sort({ at: -1 }).limit(500).lean() });
}));

/* ---------- top customers (for dashboard cards) ---------- */
r.get('/reports/customers', ah(async (_req, res) => {
  const [top, credit] = await Promise.all([
    Customer.find().sort({ totalSpent: -1 }).limit(10).lean(),
    Customer.find({ creditDue: { $gt: 0 } }).sort({ creditDue: -1 }).limit(50).lean(),
  ]);
  res.json({ top, credit });
}));

export default r;
