/* Авторизация: bcrypt-хеш + JWT в httpOnly cookie. */
import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';
import { queryOne, query } from './db.js';

const SECRET = process.env.AUTH_SECRET;
if (!SECRET) throw new Error('AUTH_SECRET не задан в .env.local');

const COOKIE_NAME = 'cc_session';
// TTL токена совпадает с maxAge cookie (30 дней), иначе сессия «отваливалась» на
// 8-й день: cookie ещё жив, а JWT уже протух. Отзыв — через session_epoch.
const TOKEN_TTL = '30d';

export function signSession(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: TOKEN_TTL, algorithm: 'HS256' });
}

export function verifySession(token) {
  try {
    // Явно фиксируем алгоритм — иначе теоретически возможна alg-confusion атака
    // (подмена на 'none' или на асимметричный алгоритм).
    return jwt.verify(token, SECRET, { algorithms: ['HS256'] });
  } catch {
    return null;
  }
}

export function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 дней
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  });
}

/** Middleware: разбирает cookie → req.session = { userId, login, role, tenantId } | null */
export function sessionMiddleware(req, _res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  req.session = token ? verifySession(token) : null;
  next();
}

/**
 * Middleware: блокирует доступ без сессии. Для API возвращает 401.
 * Сверяет session_epoch и is_active. Прописывает req.tenantId для всех маршрутов.
 */
export async function requireAuth(req, res, next) {
  try {
    if (!req.session) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    const u = await queryOne(
      `SELECT u.session_epoch, u.is_active, t.is_active AS tenant_active
       FROM users u JOIN tenants t ON t.id = u.tenant_id
       WHERE u.id = $1`,
      [req.session.userId]
    );
    if (!u || u.is_active === false || u.tenant_active === false || (req.session.epoch ?? 0) !== u.session_epoch) {
      clearSessionCookie(res);
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    req.tenantId = req.session.tenantId;
    next();
  } catch (e) {
    next(e);
  }
}

// Тенант-оператор платформы (демо «Карнавал»). Его владелец = админ платформы:
// видит заявки и заводит клиентам аккаунты. Можно переопределить через env.
export const PLATFORM_TENANT_ID = (() => {
  const id = process.env.PLATFORM_TENANT_ID;
  if (!id && process.env.NODE_ENV === 'production') {
    throw new Error('PLATFORM_TENANT_ID обязателен в production');
  }
  return id || '00000000-0000-0000-0000-000000000001';
})();

/** Middleware: только владелец тенанта-оператора платформы (провижининг клиентов). */
export function requirePlatformAdmin(req, res, next) {
  if (req.session?.tenantId === PLATFORM_TENANT_ID && req.session?.role === 'owner') return next();
  return res.status(403).json({ ok: false, error: 'forbidden' });
}

/**
 * Middleware-фабрика: пускает только указанные роли.
 * Роли: owner | manager | employee.
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session) return res.status(401).json({ ok: false, error: 'unauthorized' });
    if (!roles.includes(req.session.role)) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }
    next();
  };
}

/**
 * Простой in-memory rate-limit без внешних зависимостей.
 */
export function rateLimit({ windowMs = 15 * 60_000, max = 10 } = {}) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
    }
    const key = `${req.ip}:${String(req.body?.login ?? '').toLowerCase()}`;
    let rec = hits.get(key);
    if (!rec || now > rec.resetAt) {
      rec = { count: 0, resetAt: now + windowMs };
      hits.set(key, rec);
    }
    rec.count++;
    if (rec.count > max) {
      const retry = Math.ceil((rec.resetAt - now) / 1000);
      res.set('Retry-After', String(retry));
      return res.status(429).json({ ok: false, error: 'Слишком много попыток. Попробуйте позже.' });
    }
    next();
  };
}

/**
 * Постоянный (в БД) rate-limit. В отличие от in-memory — переживает рестарты
 * контейнера и работает на нескольких инстансах. Атомарный upsert со сбросом
 * окна. При сбое БД — fail-open (не блокируем легитимных: во время отказа БД
 * вход всё равно невозможен).
 */
export function dbRateLimit({ windowMs, max, prefix = 'rl' }) {
  return async (req, res, next) => {
    if (process.env.RATE_LIMIT_DISABLED === 'true') return next();
    try {
      const key = `${prefix}:${req.ip}:${String(req.body?.login ?? '').toLowerCase()}`.slice(0, 200);
      const now = Date.now();
      const resetAt = new Date(now + windowMs);
      const row = await queryOne(
        `INSERT INTO rate_limits (key, count, reset_at) VALUES ($1, 1, $2)
         ON CONFLICT (key) DO UPDATE SET
           count    = CASE WHEN rate_limits.reset_at < NOW() THEN 1 ELSE rate_limits.count + 1 END,
           reset_at = CASE WHEN rate_limits.reset_at < NOW() THEN $2 ELSE rate_limits.reset_at END
         RETURNING count, reset_at`,
        [key, resetAt]
      );
      // Опортунистическая чистка протухших записей (редко, чтобы таблица не росла).
      if (Math.random() < 0.02) {
        query(`DELETE FROM rate_limits WHERE reset_at < NOW() - INTERVAL '1 day'`).catch(() => {});
      }
      if (row.count > max) {
        const retry = Math.max(1, Math.ceil((new Date(row.reset_at).getTime() - now) / 1000));
        res.set('Retry-After', String(retry));
        return res.status(429).json({ ok: false, error: 'Слишком много попыток. Попробуйте позже.' });
      }
      next();
    } catch (e) {
      console.error('[dbRateLimit] error:', e.message);
      next(); // fail-open
    }
  };
}

export { bcryptjs, COOKIE_NAME };
