import jwt from 'jsonwebtoken';
import { User } from './models.js';
import { HttpError } from './util.js';

const SECRET = () => {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error('JWT_SECRET missing or too short in server/.env');
  return s;
};

export const signToken = (user) =>
  jwt.sign({ sub: String(user._id), role: user.role }, SECRET(), { expiresIn: process.env.JWT_EXPIRES || '12h' });

// Small in-memory cache so every request doesn't hit Mongo for the user row.
const userCache = new Map(); // id -> { user, until }
export const dropUserCache = (id) => (id ? userCache.delete(String(id)) : userCache.clear());

export async function requireAuth(req, _res, next) {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : req.query.token;
    if (!token) throw new HttpError(401, 'Please log in');
    let payload;
    try { payload = jwt.verify(token, SECRET()); } catch { throw new HttpError(401, 'Session expired — please log in again'); }
    let hit = userCache.get(payload.sub);
    if (!hit || hit.until < Date.now()) {
      const user = await User.findById(payload.sub).lean();
      hit = { user, until: Date.now() + 30000 };
      userCache.set(payload.sub, hit);
    }
    if (!hit.user || !hit.user.active) throw new HttpError(401, 'Account disabled');
    req.user = hit.user;
    next();
  } catch (e) { next(e); }
}

export const can = (user, perm) => user?.role === 'admin' || (user?.permissions || []).includes(perm);

/** Route guard: admin always passes; staff needs the permission. */
export const need = (perm) => (req, _res, next) =>
  can(req.user, perm) ? next() : next(new HttpError(403, 'You do not have permission for this'));

export const adminOnly = (req, _res, next) =>
  req.user?.role === 'admin' ? next() : next(new HttpError(403, 'Owner/admin only'));

/* -------- login brute-force guard: 8 tries / 10 min per IP+username -------- */
const tries = new Map();
export function loginGuard(req, _res, next) {
  const key = `${req.ip}|${String(req.body?.username || '').toLowerCase()}`;
  const now = Date.now();
  const t = tries.get(key) || { n: 0, reset: now + 600000 };
  if (t.reset < now) { t.n = 0; t.reset = now + 600000; }
  if (t.n >= 8) return next(new HttpError(429, 'Too many attempts. Try again in 10 minutes.'));
  t.n += 1;
  tries.set(key, t);
  req.clearLoginTries = () => tries.delete(key);
  next();
}

export const publicUser = (u) => ({
  id: u._id, name: u.name, username: u.username, role: u.role,
  permissions: u.role === 'admin' ? ['*'] : u.permissions || [], phone: u.phone,
});
