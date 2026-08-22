/* Прочие маршруты: dashboard, transactions, notifications, settings, team, calendar */
import { Router } from 'express';
import { pool, query, queryOne } from '../db.js';
import { requireRole, bcryptjs } from '../auth.js';
import { ensureReminders } from '../notify.js';
import { HOLDING_STATUSES } from '../stock.js';
import { logAudit } from '../audit.js';
import crypto from 'node:crypto';

const router = Router();

// Роли, назначаемые через API (owner создаётся только при регистрации прокатной точки,
// не выдаётся через приглашения/редактирование). Единый источник для invite и PUT /team.
const ASSIGNABLE_ROLES = ['employee', 'manager'];

const ymd = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ===== Dashboard ==============================================================
router.get('/dashboard/stats', async (req, res) => {
  const today = ymd();
  const tid = req.tenantId;
  const issueToday = await queryOne(
    `SELECT COUNT(*)::int AS n FROM orders
     WHERE tenant_id = $1 AND issue_date <= $2 AND status IN ('book','conf','build')`,
    [tid, today]
  );
  const returnToday = await queryOne(
    `SELECT COUNT(*)::int AS n FROM orders
     WHERE tenant_id = $1 AND return_date = $2 AND status IN ('out','over')`,
    [tid, today]
  );
  const overdue = await queryOne(
    `SELECT COUNT(*)::int AS n FROM orders
     WHERE tenant_id = $1 AND status NOT IN ('closed','cancelled')
       AND (
         status = 'over'
         OR (status = 'out' AND return_date < $2)
       )`,
    [tid, today]
  );
  const assembling = await queryOne(
    `SELECT COUNT(*)::int AS n FROM orders WHERE tenant_id = $1 AND status = 'build'`,
    [tid]
  );
  const wh = await queryOne(
    `SELECT COALESCE(SUM(c.total), 0)::int AS total_units,
            COALESCE(SUM(GREATEST(0, c.total - COALESCE((
              SELECT SUM(oi.qty)::int FROM order_items oi JOIN orders o ON o.id = oi.order_id
              WHERE oi.costume_id = c.id AND o.status = ANY($2)
                AND o.issue_date <= CURRENT_DATE AND o.return_date >= CURRENT_DATE), 0))), 0)::int AS free_units
     FROM costumes c WHERE c.tenant_id = $1 AND c.is_active = TRUE`,
    [tid, HOLDING_STATUSES]
  );
  res.json({
    ok: true,
    stats: {
      issue_today: issueToday.n,
      return_today: returnToday.n,
      overdue: overdue.n,
      assembling: assembling.n,
      warehouse_total: wh.total_units,
      warehouse_free: wh.free_units,
    },
  });
});

router.get('/dashboard/queue', async (req, res) => {
  const today = ymd();
  const tid = req.tenantId;
  const rows = await query(
    `SELECT o.id, o.number, o.status, o.issue_date, o.return_date,
            o.delivery_addr, c.name AS client_name, c.phone AS client_phone,
            c.address AS client_address,
            (SELECT json_agg(json_build_object('name', oi.name, 'costume_type', oi.costume_type, 'qty', oi.qty))
             FROM order_items oi WHERE oi.order_id = o.id) AS items
     FROM orders o LEFT JOIN clients c ON c.id = o.client_id
     WHERE o.tenant_id = $1
       AND o.status NOT IN ('closed', 'cancelled', 'req')
       AND (
         (o.status IN ('book','conf','build') AND o.issue_date <= $2)
         OR (o.status IN ('out','over') AND o.return_date = $2)
         OR o.status = 'over'
         OR (o.status = 'out' AND o.return_date < $2)
       )
     ORDER BY CASE
       WHEN o.status = 'over' OR (o.status = 'out' AND o.return_date < $2) THEN 0
       WHEN o.status IN ('book','conf','build') THEN 1
       ELSE 2 END, o.return_date, o.issue_date`,
    [tid, today]
  );
  res.json({ ok: true, items: rows });
});

router.get('/dashboard/upcoming-bookings', async (req, res) => {
  const today = ymd();
  const tid = req.tenantId;
  const rows = await query(
    `SELECT o.id, o.number, o.issue_date, o.total, c.name AS client_name,
            (SELECT COUNT(*)::int FROM order_items oi WHERE oi.order_id = o.id) AS items_count
     FROM orders o LEFT JOIN clients c ON c.id = o.client_id
     WHERE o.tenant_id = $1 AND o.issue_date > $2 AND o.status IN ('book','conf')
     ORDER BY o.issue_date LIMIT 10`,
    [tid, today]
  );
  res.json({ ok: true, items: rows });
});

const geoCache = new Map();
router.get('/geocode', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 3) return res.status(400).json({ ok: false, error: 'слишком короткий адрес' });
  if (q.length > 200) return res.status(400).json({ ok: false, error: 'адрес слишком длинный' });
  const key = q.toLowerCase();
  if (geoCache.has(key)) return res.json({ ok: true, ...geoCache.get(key) });
  const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q='
    + encodeURIComponent(q + ', Ташкент, Узбекистан');
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'RentoCostumeRental/1.0 (maps-open)' },
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return res.json({ ok: true, lat: null, lng: null });
    const arr = await r.json();
    const hit = Array.isArray(arr) && arr[0] ? {
      lat: Number(arr[0].lat),
      lng: Number(arr[0].lon),
      label: arr[0].display_name || q,
    } : { lat: null, lng: null };
    if (geoCache.size > 200) geoCache.clear();
    geoCache.set(key, hit);
    res.json({ ok: true, ...hit });
  } catch {
    res.json({ ok: true, lat: null, lng: null });
  }
});

// ===== Transactions ===========================================================
router.get('/transactions', async (req, res) => {
  const limit = Math.min(200, Number(req.query.limit) || 50);
  const rows = await query(
    `SELECT id, type, amount, category, description, date, payment_method, order_id, client_id, created_at
     FROM transactions WHERE tenant_id = $1
     ORDER BY date DESC, created_at DESC LIMIT $2`,
    [req.tenantId, limit]
  );
  res.json({ ok: true, items: rows });
});

router.post('/transactions', requireRole('owner', 'manager'), async (req, res) => {
  const { type, amount, category, description, date, payment_method, order_id, client_id } = req.body ?? {};
  const amt = Number(amount);
  if (!['income', 'expense'].includes(type)) {
    return res.status(400).json({ ok: false, error: 'type должен быть income или expense' });
  }
  if (!Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ ok: false, error: 'amount должен быть положительным числом' });
  }
  if (!category || typeof category !== 'string') {
    return res.status(400).json({ ok: false, error: 'category обязательна' });
  }
  // M1: order_id/client_id из тела запроса обязаны принадлежать своему тенанту.
  if (order_id) {
    const o = await queryOne(`SELECT id FROM orders WHERE id = $1 AND tenant_id = $2`, [order_id, req.tenantId]);
    if (!o) return res.status(400).json({ ok: false, error: 'order_id не принадлежит вашему прокату' });
  }
  if (client_id) {
    const c = await queryOne(`SELECT id FROM clients WHERE id = $1 AND tenant_id = $2`, [client_id, req.tenantId]);
    if (!c) return res.status(400).json({ ok: false, error: 'client_id не принадлежит вашему прокату' });
  }
  const r = await queryOne(
    `INSERT INTO transactions (tenant_id, type, amount, category, description, date, payment_method, order_id, client_id, created_by)
     VALUES ($1,$2,$3,$4,$5,COALESCE($6, CURRENT_DATE),$7,$8,$9,$10) RETURNING *`,
    [req.tenantId, type, amt, category, description ?? null, date ?? null, payment_method ?? null, order_id ?? null, client_id ?? null, req.session?.userId ?? null]
  );
  res.json({ ok: true, transaction: r });
});

router.get('/transactions/summary', async (req, res) => {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const sixAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const sixStart = `${sixAgo.getFullYear()}-${String(sixAgo.getMonth() + 1).padStart(2, '0')}-01`;
  const tid = req.tenantId;

  const rows = await query(
    `SELECT type, SUM(amount)::numeric AS total FROM transactions
     WHERE tenant_id = $1 AND date >= $2 GROUP BY type`,
    [tid, monthStart]
  );
  const byCat = await query(
    `SELECT type, category, SUM(amount)::numeric AS total FROM transactions
     WHERE tenant_id = $1 AND date >= $2 GROUP BY type, category ORDER BY total DESC`,
    [tid, monthStart]
  );
  const byMonth = await query(
    `SELECT to_char(date_trunc('month', date), 'YYYY-MM') AS month, type, SUM(amount)::numeric AS total
     FROM transactions
     WHERE tenant_id = $1 AND date >= $2
     GROUP BY 1, 2 ORDER BY 1`,
    [tid, sixStart]
  );
  res.json({ ok: true, current_month: rows, by_category: byCat, by_month: byMonth });
});

// ===== Notifications ==========================================================
router.get('/notifications', async (req, res) => {
  // Лениво досоздаём напоминания о просрочке / возврате сегодня (с дедупликацией).
  await ensureReminders(req.tenantId).catch((e) => console.error('ensureReminders:', e.message));
  const rows = await query(
    `SELECT id, type, icon, title, subtitle, link_to, read, created_at
     FROM notifications WHERE user_id = $1
     ORDER BY created_at DESC LIMIT 50`,
    [req.session.userId]
  );
  res.json({ ok: true, items: rows });
});

router.post('/notifications/mark-read', async (req, res) => {
  const { ids } = req.body ?? {};
  if (Array.isArray(ids) && ids.length) {
    await query(
      `UPDATE notifications SET read = TRUE WHERE user_id = $1 AND id = ANY($2)`,
      [req.session.userId, ids]
    );
  } else {
    await query(
      `UPDATE notifications SET read = TRUE WHERE user_id = $1 AND read = FALSE`,
      [req.session.userId]
    );
  }
  res.json({ ok: true });
});

// ===== Ящики в комнатах =======================================================
const ROOM_IDS = new Set(['1', '2', '3', 'S']);

function cleanBinName(v) {
  const name = String(v || '').trim().slice(0, 40);
  return name;
}

router.get('/bins', async (req, res) => {
  const items = await query(
    `SELECT id, room_id, name, sort FROM room_bins
      WHERE tenant_id = $1 ORDER BY room_id, sort, name`,
    [req.tenantId]
  );
  res.json({ ok: true, items });
});

router.post('/bins', requireRole('owner', 'manager'), async (req, res) => {
  const roomId = String(req.body?.room_id || '').trim();
  const name = cleanBinName(req.body?.name);
  if (!ROOM_IDS.has(roomId)) return res.status(400).json({ ok: false, error: 'Не та комната' });
  if (!name) return res.status(400).json({ ok: false, error: 'Напишите название' });
  const last = await queryOne(
    `SELECT COALESCE(MAX(sort), -1) + 1 AS n FROM room_bins WHERE tenant_id = $1 AND room_id = $2`,
    [req.tenantId, roomId]
  );
  const row = await queryOne(
    `INSERT INTO room_bins (tenant_id, room_id, name, sort) VALUES ($1,$2,$3,$4)
     RETURNING id, room_id, name, sort`,
    [req.tenantId, roomId, name, last?.n || 0]
  );
  await logAudit(req, 'bin.create', 'bin', row.id, { room_id: roomId, name });
  res.json({ ok: true, bin: row });
});

router.patch('/bins/:id', requireRole('owner', 'manager'), async (req, res) => {
  const name = cleanBinName(req.body?.name);
  if (!name) return res.status(400).json({ ok: false, error: 'Напишите название' });
  const row = await queryOne(
    `UPDATE room_bins SET name = $3 WHERE id = $1 AND tenant_id = $2
     RETURNING id, room_id, name, sort`,
    [req.params.id, req.tenantId, name]
  );
  if (!row) return res.status(404).json({ ok: false, error: 'not found' });
  await logAudit(req, 'bin.rename', 'bin', row.id, { name });
  res.json({ ok: true, bin: row });
});

router.delete('/bins/:id', requireRole('owner', 'manager'), async (req, res) => {
  const row = await queryOne(
    `SELECT id, room_id, name FROM room_bins WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, req.tenantId]
  );
  if (!row) return res.status(404).json({ ok: false, error: 'not found' });
  const loc = `${row.room_id}Y-${row.id}`;
  await query(`UPDATE costumes SET location = NULL WHERE tenant_id = $1 AND location = $2`, [req.tenantId, loc]);
  await query(`DELETE FROM room_bins WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.tenantId]);
  await logAudit(req, 'bin.delete', 'bin', row.id, { name: row.name });
  res.json({ ok: true });
});

// ===== Settings ===============================================================
router.get('/settings', async (req, res) => {
  const s = await queryOne(`SELECT * FROM settings WHERE tenant_id = $1`, [req.tenantId]);
  res.json({ ok: true, settings: s });
});

router.put('/settings', requireRole('owner'), async (req, res) => {
  const b = req.body ?? {};
  const num = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : null; };
  const bool = (v) => (v == null ? null : Boolean(v));
  const r = await queryOne(
    `UPDATE settings SET
       shop_name = COALESCE($2, shop_name),
       address = COALESCE($3, address),
       phone = COALESCE($4, phone),
       currency = COALESCE($5, currency),
       work_hours = COALESCE($6, work_hours),
       min_rent_days = COALESCE($7, min_rent_days),
       deposit_pct = COALESCE($8, deposit_pct),
       fine_pct_per_day = COALESCE($9, fine_pct_per_day),
       org_discount_pct = COALESCE($10, org_discount_pct),
       notif_new_order = COALESCE($11, notif_new_order),
       notif_overdue = COALESCE($12, notif_overdue),
       notif_telegram = COALESCE($13, notif_telegram),
       notif_daily_report = COALESCE($14, notif_daily_report),
       updated_at = NOW()
     WHERE tenant_id = $1 RETURNING *`,
    [
      req.tenantId,
      b.shop_name ?? null, b.address ?? null, b.phone ?? null, b.currency ?? null, b.work_hours ?? null,
      num(b.min_rent_days), num(b.deposit_pct), num(b.fine_pct_per_day), num(b.org_discount_pct),
      bool(b.notif_new_order), bool(b.notif_overdue), bool(b.notif_telegram), bool(b.notif_daily_report),
    ]
  );
  await logAudit(req, 'settings.update', 'settings', req.tenantId, null);
  res.json({ ok: true, settings: r });
});

// ===== Team ==================================================================
router.get('/team', async (req, res) => {
  const rows = await query(
    `SELECT id, name, role, email, phone, telegram, avatar_text, gradient, is_active, last_login_at, created_at
     FROM users WHERE tenant_id = $1 ORDER BY created_at`,
    [req.tenantId]
  );
  res.json({ ok: true, items: rows });
});

// Обновить профиль члена команды (owner может редактировать всех, остальные — только себя)
router.put('/team/:id', async (req, res) => {
  const targetId = req.params.id;
  const isOwner = req.session.role === 'owner';
  const isSelf = req.session.userId === targetId;
  if (!isOwner && !isSelf) {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }

  const { name, email, phone, telegram, birthday, address, avatar_text, gradient } = req.body ?? {};

  // Только owner может менять роль. Роль обязана быть из allow-list (employee/manager) —
  // произвольная строка ломает инварианты requireRole, поэтому невалидная роль → 400.
  let roleClause = '';
  const params = [targetId, req.tenantId, name ?? null, email ?? null, phone ?? null,
                  telegram ?? null, birthday ?? null, address ?? null, avatar_text ?? null, gradient ?? null];

  if (isOwner && req.body.role !== undefined) {
    if (!ASSIGNABLE_ROLES.includes(req.body.role)) {
      return res.status(400).json({ ok: false, error: 'role: employee или manager' });
    }
    params.push(req.body.role);
    roleClause = `, role = $${params.length}`;
  }

  const r = await queryOne(
    `UPDATE users SET
       name = COALESCE($3, name),
       email = COALESCE($4, email),
       phone = COALESCE($5, phone),
       telegram = COALESCE($6, telegram),
       birthday = COALESCE($7, birthday),
       address = COALESCE($8, address),
       avatar_text = COALESCE($9, avatar_text),
       gradient = COALESCE($10, gradient)
       ${roleClause}
     WHERE id = $1 AND tenant_id = $2
     RETURNING id, name, role, email, phone, telegram, avatar_text, gradient, birthday, address`,
    params
  );
  if (!r) return res.status(404).json({ ok: false, error: 'not found' });
  // Аудитим только смену роли (профильные правки самого себя — шум).
  if (isOwner && req.body.role !== undefined) {
    await logAudit(req, 'team.role_change', 'user', targetId, { role: r.role });
  }
  res.json({ ok: true, user: r });
});

// Деактивировать сотрудника (только owner, нельзя деактивировать себя)
router.delete('/team/:id', requireRole('owner'), async (req, res) => {
  if (req.params.id === req.session.userId) {
    return res.status(400).json({ ok: false, error: 'Нельзя деактивировать себя' });
  }
  const r = await queryOne(
    `UPDATE users SET is_active = FALSE WHERE id = $1 AND tenant_id = $2 RETURNING id`,
    [req.params.id, req.tenantId]
  );
  if (!r) return res.status(404).json({ ok: false, error: 'not found' });
  await logAudit(req, 'team.delete', 'user', req.params.id, null);
  res.json({ ok: true });
});

// ===== Invites — создать и получить список ===================================
router.post('/team/invite', requireRole('owner', 'manager'), async (req, res) => {
  const { role = 'employee', name_hint, expiresInDays = 7 } = req.body ?? {};
  if (!ASSIGNABLE_ROLES.includes(role)) {
    return res.status(400).json({ ok: false, error: 'role: employee или manager' });
  }
  const days = Math.min(30, Math.max(1, Number(expiresInDays) || 7));
  const token = crypto.randomBytes(24).toString('base64url');

  const inv = await queryOne(
    `INSERT INTO invites (tenant_id, token, role, name_hint, created_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, NOW() + ($6 || ' days')::INTERVAL)
     RETURNING id, token, role, name_hint, expires_at, created_at`,
    [req.tenantId, token, role, name_hint ?? null, req.session.userId, String(days)]
  );

  const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  await logAudit(req, 'team.invite', 'user', inv.id, { role });
  res.json({ ok: true, invite: inv, url: `${baseUrl}/join.html?token=${token}` });
});

router.get('/team/invites', requireRole('owner', 'manager'), async (req, res) => {
  const rows = await query(
    `SELECT i.id, i.token, i.role, i.name_hint, i.expires_at, i.used_at, i.created_at,
            u.name AS used_by_name
     FROM invites i LEFT JOIN users u ON u.id = i.used_by
     WHERE i.tenant_id = $1
     ORDER BY i.created_at DESC LIMIT 50`,
    [req.tenantId]
  );
  res.json({ ok: true, items: rows });
});

// ===== Calendar ==============================================================
router.get('/calendar', async (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) {
    return res.status(400).json({ ok: false, error: 'year и month обязательны' });
  }
  const m = String(month).padStart(2, '0');
  const start = `${year}-${m}-01`;
  const lastDay = new Date(Number(year), Number(month), 0).getDate();
  const end = `${year}-${m}-${String(lastDay).padStart(2, '0')}`;
  const rows = await query(
    `SELECT o.id, o.number, o.status, o.issue_date, o.return_date, c.name AS client_name
     FROM orders o LEFT JOIN clients c ON c.id = o.client_id
     WHERE o.tenant_id = $1 AND o.issue_date <= $3 AND o.return_date >= $2
     ORDER BY o.issue_date`,
    [req.tenantId, start, end]
  );
  res.json({ ok: true, items: rows });
});

// ===== Рейтинг сотрудницы: авто-метрики (на лету) + средняя ⭐ ================
// Доступ: owner/manager — по любому; сотрудница — только свои метрики.
router.get('/team/:id/stats', async (req, res) => {
  const targetId = req.params.id;
  const isManager = ['owner', 'manager'].includes(req.session.role);
  const isSelf = req.session.userId === targetId;
  if (!isManager && !isSelf) return res.status(403).json({ ok: false, error: 'forbidden' });

  // Заказы сотрудницы, дошедшие до выдачи/просрочки/закрытия.
  // out_date — дата фактического перехода в «выдан» из истории заказа (по местной TZ
  // сессии). Если такого события нет — дату выдачи считать нельзя (в «вовремя» не идёт).
  const rows = await query(
    `SELECT o.id, o.issue_date, o.is_assembled,
       (SELECT COUNT(*) FROM order_checklist ck WHERE ck.order_id = o.id)::int AS ck_total,
       (SELECT COUNT(*) FILTER (WHERE ck.done) FROM order_checklist ck WHERE ck.order_id = o.id)::int AS ck_done,
       (SELECT MIN(oh.created_at)::date FROM order_history oh
          WHERE oh.order_id = o.id AND oh.event = 'status_changed' AND oh.detail LIKE '%out%') AS out_date
     FROM orders o
     WHERE o.tenant_id = $1 AND o.assigned_to = $2 AND o.status IN ('out', 'over', 'closed')`,
    [req.tenantId, targetId]
  );
  const ordersDone = rows.length;
  // Полнота: собран без пропусков = is_assembled ИЛИ все позиции чек-листа отмечены.
  const assembled = rows.filter((r) => r.is_assembled || (r.ck_total > 0 && r.ck_done >= r.ck_total)).length;
  const assembled_pct = ordersDone ? Math.round((assembled / ordersDone) * 100) : null;
  // Вовремя: считаем только по заказам, где известна фактическая дата выдачи.
  const timed = rows.filter((r) => r.out_date != null);
  const onTime = timed.filter((r) => String(r.out_date) <= String(r.issue_date)).length;
  const ontime_pct = timed.length ? Math.round((onTime / timed.length) * 100) : null;

  const rt = await queryOne(
    `SELECT AVG(stars)::numeric(3,2) AS avg, COUNT(*)::int AS cnt
       FROM order_ratings WHERE tenant_id = $1 AND employee_id = $2`,
    [req.tenantId, targetId]
  );
  res.json({
    ok: true,
    stats: {
      orders_done: ordersDone,
      assembled_pct,                       // null → «нет данных» (нет собранных заказов)
      ontime_pct,                          // null → «нет данных» (нет известных дат выдачи)
      ontime_basis: timed.length,          // по скольким заказам посчитано «вовремя»
      avg_rating: rt.avg != null ? Number(rt.avg) : null,
      ratings_count: rt.cnt,
    },
  });
});

// ===== Audit log (журнал) — только владелец ==================================
router.get('/audit', requireRole('owner'), async (req, res) => {
  const limit = Math.min(200, Number(req.query.limit) || 100);
  const rows = await query(
    `SELECT a.id, a.action, a.entity, a.entity_id, a.meta, a.created_at,
            u.name AS user_name
     FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
     WHERE a.tenant_id = $1
     ORDER BY a.created_at DESC LIMIT $2`,
    [req.tenantId, limit]
  );
  res.json({ ok: true, items: rows });
});

export default router;
