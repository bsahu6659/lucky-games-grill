// Shared billing math — imported by BOTH the server (authoritative) and the
// React client (live preview), so the counter screen and the invoice always agree.

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Elapsed play time in ms for a session object coming from the API. */
export function elapsedMs(s, now = Date.now()) {
  if (!s) return 0;
  let ms = s.accumulatedMs || 0;
  if (s.state === 'running' && s.lastResumedAt) ms += now - new Date(s.lastResumedAt).getTime();
  if (s.stopAtMinutes) ms = Math.min(ms, s.stopAtMinutes * 60000);
  return Math.max(0, ms);
}

/**
 * Charge for one station session.
 * type:     { rates:[r1P, r2P, ...], blockMinutes }
 * settings: { graceMinutes, bonus:{ enabled, afterMinutes, freeMinutes } }
 */
export function sessionCharge({ ms, players = 1, snacks = [], type, settings = {} }) {
  const block = Math.max(1, Number(type?.blockMinutes) || 30);
  const rates = type?.rates?.length ? type.rates : [0];
  const minutes = ms / 60000;
  let billable = minutes;
  let bonusMinutes = 0;
  const bonus = settings.bonus || {};
  if (bonus.enabled && bonus.afterMinutes > 0 && bonus.freeMinutes > 0 && minutes >= bonus.afterMinutes) {
    bonusMinutes = Math.min(bonus.freeMinutes, minutes - bonus.afterMinutes);
    billable = minutes - bonusMinutes;
  }
  const grace = Math.max(0, Number(settings.graceMinutes) || 0);
  const units = Math.max(1, Math.ceil(Math.max(0, billable - grace) / block - 1e-9));
  const p = Math.min(Math.max(1, players), rates.length);
  const rate = Number(rates[p - 1]) || 0;
  const base = round2(units * rate);
  const snackTotal = round2(snacks.reduce((a, x) => a + (Number(x.price) || 0) * (Number(x.qty) || 0), 0));
  return {
    units, rate, players: p, block, base, snackTotal, bonusMinutes: Math.round(bonusMinutes),
    paidMinutes: units * block, amount: round2(base + snackTotal),
  };
}

/**
 * Whole-bill math.
 * discount: { mode: 'amount' | 'percent', value }   amount: -ve = discount, +ve = surcharge
 * loyaltyAmount: rupees knocked off by redeemed points
 * tax: { enabled, rate }  (exclusive GST on the taxable amount)
 */
export function billTotals({ subtotal, discount = {}, loyaltyAmount = 0, tax = {} }) {
  subtotal = round2(subtotal);
  const v = Number(discount.value) || 0;
  let adjustment = 0;
  if (discount.mode === 'percent') adjustment = -round2((subtotal * Math.min(100, Math.max(0, v))) / 100);
  else adjustment = round2(v);
  const loyalty = round2(Math.max(0, Math.min(loyaltyAmount, subtotal + adjustment)));
  const taxable = Math.max(0, round2(subtotal + adjustment - loyalty));
  const taxAmount = tax.enabled ? round2((taxable * (Number(tax.rate) || 0)) / 100) : 0;
  return { subtotal, adjustment, loyalty, taxable, taxAmount, total: round2(taxable + taxAmount) };
}

export const hms = (ms) => {
  const s = Math.floor(ms / 1000);
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((x) => String(x).padStart(2, '0')).join(':');
};

export const PERMISSIONS = [
  ['billing', 'Billing & invoices'],
  ['snacksSale', 'Snacks Sale (walk-in)'],
  ['transfer', 'Transfer stations'],
  ['editTimer', 'Edit timer'],
  ['reset', 'Reset sessions / Reset All'],
  ['discount', 'Give discount'],
  ['customers', 'Customers'],
  ['bookings', 'Bookings'],
  ['memberships', 'Memberships & recharge'],
  ['tournaments', 'Tournaments'],
  ['expenses', 'Expenses & income'],
  ['reports', 'Reports & revenue'],
  ['setup', 'Shop setup (rates, stations, snacks)'],
];
export const DEFAULT_STAFF_PERMS = ['billing', 'snacksSale', 'transfer', 'customers', 'bookings', 'discount'];
