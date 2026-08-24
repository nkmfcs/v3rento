/* Маршруты авторизации: login, logout, me, register, join */
import { Router } from 'express';
import { pool, queryOne, query } from '../db.js';
import { signSession, setSessionCookie, clearSessionCookie, requireAuth, dbRateLimit, bcryptjs } from '../auth.js';
import { logAudit } from '../audit.js';
import { makeSlug, makeUniqueSlug } from '../slug.js';

const router = Router();

// DB-backed лимитеры — переживают рестарты Railway.
const loginLimiter = dbRateLimit({ windowMs: 15 * 60_000, max: 10, prefix: 'login' });
const registerLimiter = dbRateLimit({ windowMs: 60 * 60_000, max: 5, prefix: 'register' });

// ===== LOGIN =================================================================
router.post('/login', loginLimiter, async (req, res) => {
  const { login, password } = req.body ?? {};
  if (typeof login !== 'string' || typeof password !== 'string' || !login || !password) {
    return res.status(400).json({ ok: false, error: 'Введите логин и пароль' });
  }

  const user = await queryOne(
    `SELECT u.id, u.login, u.password_hash, u.name, u.role,
            u.avatar_text, u.gradient, u.is_active, u.session_epoch,
            u.tenant_id, t.name AS tenant_name, t.slug AS tenant_slug
     FROM users u
     JOIN tenants t ON t.id = u.tenant_id
     WHERE u.login = $1`,
    [login.trim().toLowerCase()]
  );

  // Фиктивный хеш для timing-safe ответа (поглощаем ~100ms bcrypt даже если юзер не найден)
  const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
  if (!user || !user.is_active) {
    await bcryptjs.compare(password, DUMMY_HASH);
    return res.status(401).json({ ok: false, error: 'Неверный логин или пароль' });
  }

  const ok = await bcryptjs.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ ok: false, error: 'Неверный логин или пароль' });
  }

  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

  const token = signSession({
    userId: user.id,
    login: user.login,
    role: user.role,
    tenantId: user.tenant_id,
    epoch: user.session_epoch,
  });
  setSessionCookie(res, token);

  // Логин происходит ДО тенант-контекста → передаём tenant/user явным override.
  await logAudit(req, 'auth.login', 'user', user.id, { login: user.login }, { tenantId: user.tenant_id, userId: user.id });

  res.json({
    ok: true,
    user: {
      id: user.id,
      login: user.login,
      name: user.name,
      role: user.role,
      avatar_text: user.avatar_text,
      gradient: user.gradient,
      tenant_id: user.tenant_id,
      tenant_name: user.tenant_name,
      tenant_slug: user.tenant_slug,
    },
  });
});

// ===== LOGOUT ================================================================
router.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

// ===== LOGOUT EVERYWHERE — отзыв всех сессий пользователя ====================
// Бампит session_epoch → все ранее выданные JWT (другие устройства) становятся
// недействительны. Текущей сессии выдаём свежий cookie, чтобы не выпасть самому.
router.post('/logout-all', requireAuth, async (req, res) => {
  const updated = await queryOne(
    `UPDATE users SET session_epoch = session_epoch + 1
     WHERE id = $1 RETURNING session_epoch, login, role, tenant_id`,
    [req.session.userId]
  );
  if (!updated) {
    clearSessionCookie(res);
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  const token = signSession({
    userId: req.session.userId,
    login: updated.login,
    role: updated.role,
    tenantId: updated.tenant_id,
    epoch: updated.session_epoch,
  });
  setSessionCookie(res, token);
  await logAudit(req, 'auth.logout_all', 'user', req.session.userId, null);
  res.json({ ok: true });
});

// ===== ME ====================================================================
router.get('/me', requireAuth, async (req, res) => {
  const user = await queryOne(
    `SELECT u.id, u.login, u.name, u.role, u.email, u.phone, u.telegram,
            u.avatar_text, u.gradient, u.birthday, u.address, u.created_at, u.last_login_at,
            u.tenant_id, t.name AS tenant_name, t.slug AS tenant_slug
     FROM users u
     JOIN tenants t ON t.id = u.tenant_id
     WHERE u.id = $1`,
    [req.session.userId]
  );
  if (!user) {
    clearSessionCookie(res);
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  res.json({ ok: true, user });
});

// ===== REGISTER — создаёт новый тенант (прокат) + владельца ================
// POST /api/auth/register { shopName, login, password, name }
router.post('/register', registerLimiter, async (req, res) => {
  const { shopName, login, password, name } = req.body ?? {};

  if (!shopName || typeof shopName !== 'string' || shopName.trim().length < 2) {
    return res.status(400).json({ ok: false, error: 'Введите название проката (минимум 2 символа)' });
  }
  if (!login || typeof login !== 'string' || login.trim().length < 3) {
    return res.status(400).json({ ok: false, error: 'Логин — минимум 3 символа' });
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ ok: false, error: 'Пароль — минимум 8 символов' });
  }
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ ok: false, error: 'Введите ваше имя' });
  }

  const cleanLogin = login.trim().toLowerCase();
  if (!/^[a-z0-9_.-]+$/.test(cleanLogin)) {
    return res.status(400).json({ ok: false, error: 'Логин: только латинские буквы, цифры, _, -, .' });
  }

  // Slug из названия проката: только a-z, 0-9, дефис
  const uniqueSlug = await makeUniqueSlug(
    makeSlug(shopName),
    (slug) => queryOne('SELECT id FROM tenants WHERE slug = $1', [slug])
  );

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Проверяем уникальность логина глобально
    const existing = await client.query(`SELECT id FROM users WHERE login = $1`, [cleanLogin]);
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, error: 'Этот логин уже занят' });
    }

    // Создаём тенант
    const tenantRes = await client.query(
      `INSERT INTO tenants (slug, name) VALUES ($1, $2) RETURNING id`,
      [uniqueSlug, shopName.trim()]
    );
    const tenantId = tenantRes.rows[0].id;

    // Публичная регистрация идёт вне тенант-контекста; ставим его на транзакцию,
    // чтобы RLS пропустил вставку в settings нового проката (true = local, сбросится на COMMIT).
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);

    // Создаём настройки для тенанта
    await client.query(
      `INSERT INTO settings (tenant_id, shop_name) VALUES ($1, $2)`,
      [tenantId, shopName.trim()]
    );

    // Создаём владельца
    const hash = await bcryptjs.hash(password, 10);
    const initials = name.trim().split(/\s+/).map(w => w[0]?.toUpperCase() ?? '').join('').slice(0, 2);
    const gradient = randomGradient();

    const userRes = await client.query(
      `INSERT INTO users (tenant_id, login, password_hash, name, role, avatar_text, gradient)
       VALUES ($1, $2, $3, $4, 'owner', $5, $6)
       RETURNING id, login, name, role, avatar_text, gradient, session_epoch`,
      [tenantId, cleanLogin, hash, name.trim(), initials, gradient]
    );
    const user = userRes.rows[0];

    await client.query('COMMIT');

    const token = signSession({
      userId: user.id,
      login: user.login,
      role: user.role,
      tenantId,
      epoch: user.session_epoch,
    });
    setSessionCookie(res, token);

    res.json({
      ok: true,
      user: {
        id: user.id,
        login: user.login,
        name: user.name,
        role: user.role,
        avatar_text: user.avatar_text,
        gradient: user.gradient,
        tenant_id: tenantId,
        tenant_name: shopName.trim(),
        tenant_slug: uniqueSlug,
      },
    });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
});

// ===== JOIN — работник регистрируется по приглашению ========================
// POST /api/auth/join { token, login, password, name }
router.post('/join', loginLimiter, async (req, res) => {
  const { token, login, password, name } = req.body ?? {};

  if (!token || typeof token !== 'string') {
    return res.status(400).json({ ok: false, error: 'Токен приглашения отсутствует' });
  }

  const invite = await queryOne(
    `SELECT i.id, i.tenant_id, i.role, i.expires_at, i.used_at,
            t.name AS tenant_name, t.slug AS tenant_slug
     FROM invites i JOIN tenants t ON t.id = i.tenant_id
     WHERE i.token = $1`,
    [token]
  );

  if (!invite) {
    return res.status(404).json({ ok: false, error: 'Приглашение не найдено или уже недействительно' });
  }
  if (invite.used_at) {
    return res.status(409).json({ ok: false, error: 'Это приглашение уже было использовано' });
  }
  if (new Date(invite.expires_at) < new Date()) {
    return res.status(410).json({ ok: false, error: 'Срок действия приглашения истёк' });
  }

  if (!login || typeof login !== 'string' || login.trim().length < 3) {
    return res.status(400).json({ ok: false, error: 'Логин — минимум 3 символа' });
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ ok: false, error: 'Пароль — минимум 8 символов' });
  }
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ ok: false, error: 'Введите ваше имя' });
  }

  const cleanLogin = login.trim().toLowerCase();
  if (!/^[a-z0-9_.-]+$/.test(cleanLogin)) {
    return res.status(400).json({ ok: false, error: 'Логин: только латинские буквы, цифры, _, -, .' });
  }

  // Проверяем уникальность логина
  const existing = await queryOne(`SELECT id FROM users WHERE login = $1`, [cleanLogin]);
  if (existing) {
    return res.status(409).json({ ok: false, error: 'Этот логин уже занят' });
  }

  const hash = await bcryptjs.hash(password, 10);
  const initials = name.trim().split(/\s+/).map(w => w[0]?.toUpperCase() ?? '').join('').slice(0, 2);
  const gradient = randomGradient();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userRes = await client.query(
      `INSERT INTO users (tenant_id, login, password_hash, name, role, avatar_text, gradient)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, login, name, role, avatar_text, gradient, session_epoch`,
      [invite.tenant_id, cleanLogin, hash, name.trim(), invite.role, initials, gradient]
    );
    const user = userRes.rows[0];

    await client.query(
      `UPDATE invites SET used_by = $1, used_at = NOW() WHERE id = $2`,
      [user.id, invite.id]
    );

    await client.query('COMMIT');

    const token2 = signSession({
      userId: user.id,
      login: user.login,
      role: user.role,
      tenantId: invite.tenant_id,
      epoch: user.session_epoch,
    });
    setSessionCookie(res, token2);

    res.json({
      ok: true,
      user: {
        id: user.id,
        login: user.login,
        name: user.name,
        role: user.role,
        avatar_text: user.avatar_text,
        gradient: user.gradient,
        tenant_id: invite.tenant_id,
        tenant_name: invite.tenant_name,
        tenant_slug: invite.tenant_slug,
      },
    });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
});

// ===== VALIDATE INVITE — для страницы join (получить имя проката по токену) ==
router.get('/invite/:token', async (req, res) => {
  const invite = await queryOne(
    `SELECT i.role, i.name_hint, i.expires_at, i.used_at, t.name AS tenant_name
     FROM invites i JOIN tenants t ON t.id = i.tenant_id
     WHERE i.token = $1`,
    [req.params.token]
  );
  if (!invite) return res.status(404).json({ ok: false, error: 'Приглашение не найдено' });
  if (invite.used_at) return res.status(409).json({ ok: false, error: 'Приглашение уже использовано' });
  if (new Date(invite.expires_at) < new Date()) return res.status(410).json({ ok: false, error: 'Срок истёк' });
  res.json({ ok: true, role: invite.role, name_hint: invite.name_hint, tenant_name: invite.tenant_name });
});

// ===== CHANGE PASSWORD =======================================================
router.post('/change-password', requireAuth, async (req, res) => {
  const { current, next } = req.body ?? {};
  if (typeof current !== 'string' || typeof next !== 'string') {
    return res.status(400).json({ ok: false, error: 'Заполните оба поля' });
  }
  if (next.length < 8) {
    return res.status(400).json({ ok: false, error: 'Новый пароль — минимум 8 символов' });
  }
  const user = await queryOne(`SELECT password_hash FROM users WHERE id = $1`, [req.session.userId]);
  if (!user) {
    clearSessionCookie(res);
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  const ok = await bcryptjs.compare(current, user.password_hash);
  if (!ok) return res.status(400).json({ ok: false, error: 'Текущий пароль неверён' });
  const hash = await bcryptjs.hash(next, 10);
  const updated = await queryOne(
    `UPDATE users SET password_hash = $1, session_epoch = session_epoch + 1
     WHERE id = $2 RETURNING session_epoch, login, role, tenant_id`,
    [hash, req.session.userId]
  );
  const token = signSession({
    userId: req.session.userId,
    login: updated.login,
    role: updated.role,
    tenantId: updated.tenant_id,
    epoch: updated.session_epoch,
  });
  setSessionCookie(res, token);
  await logAudit(req, 'auth.password_change', 'user', req.session.userId, null);
  res.json({ ok: true });
});

export default router;

// ===== Helpers ===============================================================

function randomGradient() {
  const palettes = [
    '#D4DCF5,#2A56C6', '#D4E8F5,#4A90C4', '#F5E6D0,#C4894A',
    '#E8D4F5,#9B4AC4', '#F5D4D4,#C44A4A', '#D4F0F5,#3D7AD9',
  ];
  return palettes[Math.floor(Math.random() * palettes.length)];
}
