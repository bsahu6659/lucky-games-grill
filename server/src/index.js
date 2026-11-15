import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import mongoose from 'mongoose';
import { requireAuth } from './auth.js';
import { sseHandler } from './events.js';
import stations, { processAutoStops } from './routes/stations.js';
import billing from './routes/billing.js';
import setup from './routes/setup.js';
import customers from './routes/customers.js';
import reports from './routes/reports.js';
import misc, { publicRouter } from './routes/misc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../../client/dist');
const PORT = +process.env.API_PORT || 5050;
const PROD = process.env.NODE_ENV === 'production';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      connectSrc: ["'self'"],
      scriptSrc: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: null, // counter PCs often open it over plain http on the shop LAN
    },
  },
  strictTransportSecurity: false,
  crossOriginEmbedderPolicy: false,
}));
// gzip everything except the live event stream (it must not be buffered)
app.use(compression({ filter: (req, res) => !req.path.startsWith('/api/events') && compression.filter(req, res) }));
app.use(express.json({ limit: '200kb' }));

/* ---------------- API ---------------- */
const api = express.Router();
api.get('/health', (_req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1, at: Date.now() }));
api.use(publicRouter);
api.get('/events', requireAuth, sseHandler);
api.use(requireAuth);
api.use(stations, billing, setup, customers, reports, misc);
api.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, api);

/* ---------------- React build (production) ---------------- */
if (fs.existsSync(DIST)) {
  app.use('/assets', express.static(path.join(DIST, 'assets'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(DIST, { maxAge: '1h', index: false }));
  app.get('*', (_req, res) => res.set('Cache-Control', 'no-cache').sendFile(path.join(DIST, 'index.html')));
} else if (PROD) {
  console.warn('client/dist not found — run `npm run build` first.');
}

/* ---------------- errors ---------------- */
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  let status = err.status || 500;
  let msg = err.message || 'Something went wrong';
  if (err.name === 'CastError') { status = 400; msg = 'Invalid id'; }
  if (err.name === 'ValidationError') { status = 400; msg = Object.values(err.errors)[0]?.message || 'Invalid data'; }
  if (err.code === 11000) { status = 400; msg = 'Duplicate entry — this already exists'; }
  if (err.type === 'entity.parse.failed') { status = 400; msg = 'Invalid JSON'; }
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 && PROD ? 'Server error — please try again' : msg });
});

/* ---------------- start ---------------- */
async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI missing in server/.env');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000, maxPoolSize: 20 });
  console.log(`MongoDB connected (${mongoose.connection.name})`);
  setInterval(() => processAutoStops().catch((e) => console.error('auto-stop', e.message)), 10000);
  app.listen(PORT, () => console.log(`Lucky Games & Grill API on http://localhost:${PORT}${fs.existsSync(DIST) ? ' (serving client/dist)' : ''}`));
}
main().catch((e) => { console.error('Startup failed:', e.message); process.exit(1); });
