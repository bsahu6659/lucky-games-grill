import mongoose from 'mongoose';
import crypto from 'node:crypto';

const { Schema, model } = mongoose;
const opts = { timestamps: true, versionKey: false };

/* ---------------- users & settings ---------------- */
const UserSchema = new Schema({
  name: { type: String, required: true, trim: true },
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['admin', 'staff'], default: 'staff' },
  permissions: { type: [String], default: [] },
  phone: String,
  active: { type: Boolean, default: true },
  lastLoginAt: Date,
}, opts);
export const User = model('User', UserSchema);

const SettingsSchema = new Schema({
  _id: { type: String, default: 'shop' },
  shopName: { type: String, default: 'Lucky Games & Grill' },
  tagline: { type: String, default: 'Play. Eat. Repeat.' },
  address: String,
  phone: String,
  email: String,
  upiId: String,
  invoicePrefix: { type: String, default: 'LGG' },
  invoiceFooter: { type: String, default: 'Thank you for playing at Lucky Games & Grill!' },
  graceMinutes: { type: Number, default: 0 },
  gst: { enabled: { type: Boolean, default: false }, gstin: String, rate: { type: Number, default: 18 } },
  bonus: { enabled: { type: Boolean, default: false }, afterMinutes: { type: Number, default: 120 }, freeMinutes: { type: Number, default: 15 } },
  loyalty: {
    enabled: { type: Boolean, default: true },
    pointsPer100: { type: Number, default: 5 },   // points earned per ₹100 paid
    pointValue: { type: Number, default: 1 },     // ₹ value of one point when redeemed
    minRedeem: { type: Number, default: 50 },
  },
  lowStockAlert: { type: Number, default: 5 },
}, { versionKey: false, timestamps: true });
export const Settings = model('Settings', SettingsSchema);

/* ---------------- stations ---------------- */
const StationTypeSchema = new Schema({
  name: { type: String, required: true, trim: true },
  icon: { type: String, default: 'gamepad' },
  blockMinutes: { type: Number, default: 30, min: 1 },
  rates: { type: [Number], default: [30] }, // index 0 = 1 player, 1 = 2 players, ...
  order: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
}, opts);
export const StationType = model('StationType', StationTypeSchema);

const SessionSchema = new Schema({
  state: { type: String, enum: ['idle', 'running', 'paused', 'done'], default: 'idle' },
  startedAt: Date,
  lastResumedAt: Date,
  accumulatedMs: { type: Number, default: 0 },
  endedAt: Date,
  players: { type: Number, default: 1 },
  snacks: [{ _id: false, snack: { type: Schema.Types.ObjectId, ref: 'Snack' }, name: String, price: Number, qty: Number }],
  customer: { _id: false, name: String, phone: String, note: String },
  stopAtMinutes: Number,
  autoStopped: Boolean,
  selected: { type: Boolean, default: true },
  startedBy: String,
}, { _id: false });

const StationSchema = new Schema({
  name: { type: String, required: true, trim: true },
  type: { type: Schema.Types.ObjectId, ref: 'StationType', required: true },
  order: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
  publicToken: { type: String, default: () => crypto.randomBytes(9).toString('base64url'), index: true },
  webhookOn: String,   // called on Start / Resume (smart plug, PC/TV lock bridge)
  webhookOff: String,  // called on Pause / Done / Reset
  session: { type: SessionSchema, default: () => ({}) },
}, opts);
export const Station = model('Station', StationSchema);

/* ---------------- snacks & customers ---------------- */
const SnackSchema = new Schema({
  name: { type: String, required: true, trim: true },
  price: { type: Number, required: true, min: 0 },
  category: { type: String, default: 'Snacks' },
  trackStock: { type: Boolean, default: true },
  stock: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
}, opts);
export const Snack = model('Snack', SnackSchema);

const CustomerSchema = new Schema({
  name: { type: String, trim: true, default: 'Customer' },
  phone: { type: String, required: true, unique: true, trim: true },
  note: String,
  visits: { type: Number, default: 0 },
  totalSpent: { type: Number, default: 0 },
  lastVisitAt: Date,
  walletBalance: { type: Number, default: 0 },
  walletExpiresAt: Date,
  membershipName: String,
  loyaltyPoints: { type: Number, default: 0 },
  creditDue: { type: Number, default: 0 },
}, opts);
CustomerSchema.index({ name: 'text', phone: 'text' });
export const Customer = model('Customer', CustomerSchema);

/* ---------------- invoices ---------------- */
const InvoiceSchema = new Schema({
  no: { type: String, required: true, unique: true },
  kind: { type: String, enum: ['session', 'snacks', 'membership'], default: 'session' },
  items: [{
    _id: false,
    label: String, stationName: String, typeName: String,
    start: Date, end: Date, playedMs: Number, players: Number,
    units: Number, block: Number, rate: Number, base: Number, bonusMinutes: Number,
    snacks: [{ _id: false, name: String, qty: Number, price: Number }],
    snackTotal: Number, amount: Number,
  }],
  subtotal: Number,
  discountMode: String,
  discountValue: Number,
  adjustment: Number,
  loyaltyPoints: { type: Number, default: 0 },
  loyaltyAmount: { type: Number, default: 0 },
  taxRate: Number,
  taxAmount: { type: Number, default: 0 },
  total: Number,
  payment: {
    _id: false,
    mode: { type: String, enum: ['cash', 'online', 'split', 'credit', 'wallet'] },
    cash: { type: Number, default: 0 },
    online: { type: Number, default: 0 },
    wallet: { type: Number, default: 0 },
  },
  status: { type: String, enum: ['paid', 'pending', 'cancelled'], default: 'paid', index: true },
  customer: { _id: false, id: { type: Schema.Types.ObjectId, ref: 'Customer' }, name: String, phone: String },
  createdBy: { _id: false, id: Schema.Types.ObjectId, name: String },
  paidAt: { type: Date, index: true },
  note: String,
}, opts);
InvoiceSchema.index({ createdAt: -1 });
InvoiceSchema.index({ 'customer.id': 1, createdAt: -1 });
export const Invoice = model('Invoice', InvoiceSchema);

export const Counter = model('Counter', new Schema({ _id: String, seq: { type: Number, default: 0 } }, { versionKey: false }));

/* ---------------- other modules ---------------- */
const ExpenseSchema = new Schema({
  kind: { type: String, enum: ['expense', 'income'], default: 'expense' },
  date: { type: String, required: true, index: true }, // YYYY-MM-DD (shop timezone)
  category: { type: String, default: 'Other' },
  amount: { type: Number, required: true, min: 0 },
  mode: { type: String, enum: ['cash', 'online'], default: 'cash' },
  note: String,
  createdBy: { _id: false, id: Schema.Types.ObjectId, name: String },
}, opts);
export const Expense = model('Expense', ExpenseSchema);

const BookingSchema = new Schema({
  customerName: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  stationType: { type: Schema.Types.ObjectId, ref: 'StationType' },
  station: { type: Schema.Types.ObjectId, ref: 'Station' },
  date: { type: String, required: true, index: true },
  time: { type: String, required: true },
  durationMinutes: { type: Number, default: 60 },
  players: { type: Number, default: 1 },
  status: { type: String, enum: ['pending', 'confirmed', 'arrived', 'completed', 'cancelled', 'no-show'], default: 'confirmed' },
  note: String,
  createdBy: { _id: false, id: Schema.Types.ObjectId, name: String },
}, opts);
export const Booking = model('Booking', BookingSchema);

const PlanSchema = new Schema({
  name: { type: String, required: true, trim: true },
  price: { type: Number, required: true, min: 0 },
  credit: { type: Number, required: true, min: 0 },
  validityDays: { type: Number, default: 30 },
  active: { type: Boolean, default: true },
}, opts);
export const Plan = model('Plan', PlanSchema);

const TournamentSchema = new Schema({
  name: { type: String, required: true, trim: true },
  game: { type: String, required: true, trim: true },
  date: { type: String, required: true },
  time: String,
  entryFee: { type: Number, default: 0 },
  prizePool: { type: Number, default: 0 },
  maxPlayers: { type: Number, default: 16 },
  status: { type: String, enum: ['upcoming', 'live', 'completed', 'cancelled'], default: 'upcoming' },
  rules: String,
  participants: [{ name: String, phone: String, team: String, paid: { type: Boolean, default: false }, mode: String, checkedIn: { type: Boolean, default: false } }],
  winners: [{ _id: false, place: Number, name: String, prize: Number }],
}, opts);
export const Tournament = model('Tournament', TournamentSchema);

const ActivitySchema = new Schema({
  at: { type: Date, default: Date.now },
  user: { _id: false, id: Schema.Types.ObjectId, name: String, role: String },
  action: String,
  detail: String,
}, { versionKey: false });
ActivitySchema.index({ at: -1 });
export const Activity = model('Activity', ActivitySchema);
