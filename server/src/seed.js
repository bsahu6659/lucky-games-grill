// First-run data: owner + staff logins, rate card, stations, snacks, a membership plan.
// Safe to run again — existing rows are left alone (use --reset-passwords to reset the two logins).
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User, Settings, StationType, Station, Snack, Plan } from './models.js';
import { DEFAULT_STAFF_PERMS } from '../../shared/pricing.js';

const RESET = process.argv.includes('--reset-passwords');
const env = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} missing in server/.env`);
  return v;
};

async function upsertUser({ username, password, name, role, permissions }) {
  const existing = await User.findOne({ username }).select('+passwordHash');
  if (existing) {
    if (RESET) { existing.passwordHash = await bcrypt.hash(password, 10); existing.active = true; await existing.save(); console.log(`  ↻ ${role} "${username}" password reset`); }
    else console.log(`  • ${role} "${username}" already exists`);
    return;
  }
  await User.create({ username, name, role, permissions, passwordHash: await bcrypt.hash(password, 10) });
  console.log(`  ✓ ${role} "${username}" created`);
}

async function main() {
  await mongoose.connect(env('MONGODB_URI'), { serverSelectionTimeoutMS: 15000 });
  console.log(`Seeding ${mongoose.connection.name} …`);

  await upsertUser({ username: env('SEED_ADMIN_USERNAME').toLowerCase(), password: env('SEED_ADMIN_PASSWORD'), name: 'Shop Owner', role: 'admin', permissions: [] });
  await upsertUser({ username: env('SEED_STAFF_USERNAME').toLowerCase(), password: env('SEED_STAFF_PASSWORD'), name: 'Counter Staff', role: 'staff', permissions: DEFAULT_STAFF_PERMS });

  if (!(await Settings.exists({ _id: 'shop' }))) {
    await Settings.create({ _id: 'shop' });
    console.log('  ✓ shop settings');
  }

  if (!(await StationType.countDocuments())) {
    const types = await StationType.insertMany([
      { name: 'PlayStation (PS5)', icon: 'gamepad', blockMinutes: 30, rates: [40, 70, 100, 120], order: 1 },
      { name: 'Gaming PC', icon: 'monitor', blockMinutes: 30, rates: [35], order: 2 },
      { name: 'Pool Table', icon: 'circle', blockMinutes: 30, rates: [60, 60, 80, 80], order: 3 },
      { name: 'VR Gaming', icon: 'glasses', blockMinutes: 15, rates: [80, 150], order: 4 },
    ]);
    const [ps5, pc, pool, vr] = types;
    const stations = [
      ['PS5 1', ps5], ['PS5 2', ps5], ['PS5 3', ps5], ['PC 1', pc], ['PC 2', pc], ['PC 3', pc], ['PC 4', pc], ['Pool 1', pool], ['VR 1', vr],
    ].map(([name, t], i) => ({ name, type: t._id, order: i + 1, session: { state: 'idle', accumulatedMs: 0, players: 1, snacks: [], customer: {}, selected: true } }));
    await Station.insertMany(stations);
    console.log(`  ✓ ${types.length} station types, ${stations.length} stations (edit rates in Shop Setup → Rate Card)`);
  }

  if (!(await Snack.countDocuments())) {
    await Snack.insertMany([
      { name: 'Classic Burger', price: 120, category: 'Grill', stock: 40 },
      { name: 'Chicken Burger', price: 150, category: 'Grill', stock: 40 },
      { name: 'French Fries', price: 90, category: 'Grill', stock: 50 },
      { name: 'Peri Peri Fries', price: 110, category: 'Grill', stock: 50 },
      { name: 'Grilled Sandwich', price: 100, category: 'Grill', stock: 30 },
      { name: 'Maggi', price: 60, category: 'Snacks', stock: 40 },
      { name: 'Nachos', price: 120, category: 'Snacks', stock: 25 },
      { name: 'Coke (300 ml)', price: 40, category: 'Drinks', stock: 48 },
      { name: 'Red Bull', price: 125, category: 'Drinks', stock: 24 },
      { name: 'Cold Coffee', price: 90, category: 'Drinks', stock: 30, trackStock: false },
      { name: 'Water Bottle', price: 20, category: 'Drinks', stock: 60 },
    ]);
    console.log('  ✓ snacks & grill menu');
  }

  if (!(await Plan.countDocuments())) {
    await Plan.insertMany([
      { name: 'Silver', price: 1000, credit: 1200, validityDays: 30 },
      { name: 'Gold', price: 2000, credit: 2600, validityDays: 60 },
    ]);
    console.log('  ✓ membership plans');
  }

  console.log('Done. Login IDs and passwords are the SEED_* values in server/.env');
  await mongoose.disconnect();
}
main().catch(async (e) => { console.error('Seed failed:', e.message); await mongoose.disconnect(); process.exit(1); });
