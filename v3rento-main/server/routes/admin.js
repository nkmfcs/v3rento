/* Консоль оператора платформы. Доступ — только владелец тенанта-оператора
 * (см. requirePlatformAdmin). Здесь: создание аккаунтов клиентам и просмотр заявок. */
import { Router } from 'express';
import { query, queryOne, currentClient, setBypassRls } from '../db.js';
import { requireAuth, requirePlatformAdmin, bcryptjs } from '../auth.js';
import { generatePassword } from '../security.js';
import { logAudit } from '../audit.js';
import { makeSlug, makeUniqueSlug } from '../slug.js';

const router = Router();
router.use(requireAuth, requirePlatformAdmin);
// Оператор платформы видит и создаёт данные ПОВЕРХ тенантов → обходим RLS
// (только здесь, только после проверки платформ-админа).
router.use(async (_req, _res, next) => {
  try { await setBypassRls(true); next(); } catch (e) { next(e); }
});

// ===== Создать аккаунт клиента (новый тенант + владелец) ====================
// НЕ трогает сессию оператора. Возвращает логин + пароль для передачи клиенту.
router.post('/create-account', async (req, res) => {
  const { shopName, login, name, password } = req.body ?? {};

  if (typeof shopName !== 'string' || shopName.trim().length < 2) {
    return res.status(400).json({ ok: false, error: 'Название проката — минимум 2 символа' });
  }
  if (typeof login !== 'string' || login.trim().length < 3) {
    return res.status(400).json({ ok: false, error: 'Логин — минимум 3 символа' });
  }
  const cleanLogin = login.trim().toLowerCase();
  if (!/^[a-z0-9_.-]+$/.test(cleanLogin)) {
    return res.status(400).json({ ok: false, error: 'Логин: латиница, цифры, _ . -' });
  }
  // Пароль: явно заданный (≥8 символов) ИЛИ сгенерированный, если поле оставили пустым.
  // Раньше молча дропали короткий пароль и генерили свой — оператор думал, что задал
  // пароль, а по факту аккаунт получал другой. Теперь строго: пусто = авто, иначе ≥8.
  const wantsCustom = typeof password === 'string' && password.length > 0;
  if (wantsCustom && password.length < 8) {
    return res.status(400).json({ ok: false, error: 'Пароль — минимум 8 символов (или оставьте поле пустым для авто-генерации)' });
  }
  const pw = wantsCustom ? password : generatePassword(14);
  const ownerName = (typeof name === 'string' && name.trim()) ? name.trim() : shopName.trim();
  const slug = await makeUniqueSlug(
    makeSlug(shopName),
    (s) => queryOne('SELECT id FROM tenants WHERE slug = $1', [s])
  );

  const client = currentClient();
  try {
    await client.query('BEGIN');
    const exists = await client.query(`SELECT id FROM users WHERE login = $1`, [cleanLogin]);
    if (exists.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, error: 'Этот логин уже занят' });
    }
    const t = await client.query(`INSERT INTO tenants (slug, name) VALUES ($1, $2) RETURNING id`, [slug, shopName.trim()]);
    const tid = t.rows[0].id;
    await client.query(`INSERT INTO settings (tenant_id, shop_name) VALUES ($1, $2)`, [tid, shopName.trim()]);
    const hash = await bcryptjs.hash(pw, 10);
    const initials = ownerName.split(/\s+/).map((w) => w[0]?.toUpperCase() ?? '').join('').slice(0, 2) || 'RE';
    await client.query(
      `INSERT INTO users (tenant_id, login, password_hash, name, role, avatar_text)
       VALUES ($1, $2, $3, $4, 'owner', $5)`,
      [tid, cleanLogin, hash, ownerName, initials]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  }

  await logAudit(req, 'admin.create_account', 'tenant', slug, { shop_name: shopName.trim(), login: cleanLogin });

  const base = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  res.json({
    ok: true,
    account: { tenant_name: shopName.trim(), login: cleanLogin, password: pw, login_url: `${base}/login.html` },
  });
});

// ===== Список всех прокатов (для оператора) ================================
router.get('/tenants', async (_req, res) => {
  const rows = await query(
    `SELECT t.id, t.slug, t.name, t.is_active, t.created_at,
            (SELECT COUNT(*)::int FROM users u WHERE u.tenant_id = t.id) AS users,
            (SELECT COUNT(*)::int FROM orders o WHERE o.tenant_id = t.id) AS orders
     FROM tenants t ORDER BY t.created_at DESC`
  );
  res.json({ ok: true, items: rows });
});

export default router;
