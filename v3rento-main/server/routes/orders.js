/* Заказы — главная сущность */
import { Router } from 'express';
import { query, queryOne, currentClient } from '../db.js';
import { requireRole } from '../auth.js';
import { notifyTenant } from '../notify.js';
import { assertAvailable } from '../stock.js';
import { logAudit } from '../audit.js';
import { checkFreeText } from '../validate.js';
import { rememberAddress } from '../addresses.js';

/** Суммирует запрошенное кол-во по костюмам: [{costume_id, qty}] → Map(costume_id→qty). */
function requestedQty(items) {
  const m = new Map();
  for (const it of items) m.set(it.costume_id, (m.get(it.costume_id) || 0) + (Number(it.qty) || 1));
  return m;
}

const router = Router();

// Заказ «держит» костюмы на складе, начиная с «Брони». «Запрос» (req) — это ещё не
// бронь: склад не резервируем (совпадает с ACTIVE_ST на фронте). Закрытый/отменённый —
// тоже не держат.
const CONSUMES_STOCK = (status) => !['req', 'closed', 'cancelled'].includes(status);

// Допустимые статусы заказа — единый источник для POST и PATCH.
const ALLOWED_STATUS = ['req', 'book', 'conf', 'build', 'out', 'over', 'closed', 'cancelled'];

/** Пересчёт кэша статистики клиента из реальных заказов — без накопления дрейфа.
 *  total_spent и debt считаются по ОДНОМУ набору статусов — только реально выданные
 *  заказы (out/over/closed). Брони (req/book/conf/build) ещё могут отмениться, поэтому
 *  не засчитываются как «потрачено» до выдачи. debt = недоплата по этим же заказам. */
async function recalcClient(db, clientId, tenantId) {
  if (!clientId) return;
  await db.query(
    `UPDATE clients c SET
       total_orders = sub.cnt,
       total_spent  = sub.spent,
       last_order_at = sub.last,
       debt = sub.debt
     FROM (
       SELECT
         COUNT(*) FILTER (WHERE status <> 'cancelled')::int AS cnt,
         COALESCE(SUM(total) FILTER (WHERE status IN ('out', 'over', 'closed')), 0) AS spent,
         MAX(created_at) FILTER (WHERE status <> 'cancelled') AS last,
         COALESCE(SUM(GREATEST(total - paid_amount, 0))
                  FILTER (WHERE status IN ('out', 'over', 'closed')), 0) AS debt
       FROM orders
       WHERE client_id = $1 AND tenant_id = $2
     ) sub
     WHERE c.id = $1 AND c.tenant_id = $2`,
    [clientId, tenantId]
  );
}

/** Записывает доход от оплаты заказа в транзакции (единая точка для POST и /payment). */
async function recordOrderIncome(db, { tenantId, orderId, clientId, number, amount, method, userId }) {
  await db.query(
    `INSERT INTO transactions
       (tenant_id, type, amount, category, description, date, payment_method, order_id, client_id, created_by)
     VALUES ($1, 'income', $2, 'Прокат', $3, CURRENT_DATE, $4, $5, $6, $7)`,
    [tenantId, amount, `Оплата заказа №${number}`, method ?? null, orderId, clientId ?? null, userId ?? null]
  );
}

/** Генерирует дефолтный чек-лист сборки, если его ещё нет (идемпотентно). */
async function ensureChecklist(db, orderId) {
  const existing = await db.query(`SELECT COUNT(*)::int AS n FROM order_checklist WHERE order_id = $1`, [orderId]);
  if (existing.rows[0].n > 0) return;
  const itemsRes = await db.query(
    `SELECT oi.name, o.delivery_type FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.order_id = $1`,
    [orderId]
  );
  const items = itemsRes.rows;
  const rows = [
    ...items.map((i, idx) => [orderId, `${i.name} — проверить размер`, idx]),
    [orderId, 'Отпарить и упаковать', items.length],
    [orderId, 'Вложить договор и чек', items.length + 1],
  ];
  for (const [oId, text, sort] of rows) {
    await db.query(`INSERT INTO order_checklist (order_id, text, sort_order) VALUES ($1, $2, $3)`, [oId, text, sort]);
  }
}

/** Загружает заказ + items + client + history + checklist. Требует tenantId для изоляции.
 *  ЧИСТОЕ ЧТЕНИЕ — никаких записей (чек-лист генерируется при переходе в «сборку»). */
async function loadFullOrder(orderId, tenantId) {
  const o = await queryOne(
    `SELECT o.*, c.name AS client_name, c.type AS client_type, c.phone AS client_phone,
            c.telegram AS client_telegram, c.address AS client_address,
            c.avatar_text AS client_avatar_text, c.gradient AS client_gradient,
            au.name AS assigned_to_name
     FROM orders o
     LEFT JOIN clients c ON c.id = o.client_id
     LEFT JOIN users au ON au.id = o.assigned_to AND au.tenant_id = o.tenant_id
     WHERE o.id = $1 AND o.tenant_id = $2`,
    [orderId, tenantId]
  );
  if (!o) return null;
  const items = await query(
    `SELECT id, costume_id, costume_type, name, description, price_per_day, qty
     FROM order_items WHERE order_id = $1`,
    [orderId]
  );
  const history = await query(
    `SELECT id, event, detail, meta, created_at, user_id
     FROM order_history WHERE order_id = $1 ORDER BY created_at`,
    [orderId]
  );
  const checklist = await query(
    `SELECT ck.id, ck.text, ck.done, ck.sort_order, ck.done_at, ck.done_by,
            u.name AS done_by_name
     FROM order_checklist ck
     LEFT JOIN users u ON u.id = ck.done_by AND u.tenant_id = $2
     WHERE ck.order_id = $1 ORDER BY ck.sort_order, ck.id`,
    [orderId, tenantId]
  );
  const rating = await queryOne(
    `SELECT r.stars, r.note, r.created_at, u.name AS rated_by_name
     FROM order_ratings r LEFT JOIN users u ON u.id = r.rated_by
     WHERE r.order_id = $1`,
    [orderId]
  );
  return { ...o, items, history, checklist, rating: rating || null };
}

router.get('/', async (req, res) => {
  const tid = req.tenantId;
  const conds = [`o.tenant_id = $1`];
  const params = [tid];

  if (req.query.status) {
    const sts = String(req.query.status).split(',').filter(Boolean);
    if (sts.length) {
      params.push(sts);
      conds.push(`o.status = ANY($${params.length})`);
    }
  }
  if (req.query.from) {
    params.push(req.query.from);
    conds.push(`o.return_date >= $${params.length}`);
  }
  if (req.query.to) {
    params.push(req.query.to);
    conds.push(`o.issue_date <= $${params.length}`);
  }
  if (req.query.q) {
    params.push(`%${String(req.query.q).toLowerCase()}%`);
    const i = params.length;
    conds.push(`(LOWER(c.name) LIKE $${i} OR CAST(o.number AS TEXT) LIKE $${i})`);
  }
  // Фильтр «мои» — заказы, назначенные текущему пользователю (очередь сборщицы).
  if (req.query.assigned === 'me') {
    params.push(req.session?.userId ?? null);
    conds.push(`o.assigned_to = $${params.length}`);
  }

  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 200));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  params.push(limit + 1); // +1 чтобы определить has_more
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const rows = await query(
    `SELECT o.id, o.number, o.status, o.issue_date, o.return_date, o.days, o.slot,
            o.delivery_type, o.delivery_addr, o.delivery_cost, o.yandex_ref, o.yandex_status,
            o.total, o.deposit, o.paid, o.paid_amount, o.payment_method, o.source,
            o.assigned_to, o.is_assembled,
            au.name AS assigned_to_name,
            c.id AS client_id, c.name AS client_name, c.type AS client_type,
            c.phone AS client_phone, c.telegram AS client_telegram, c.address AS client_address,
            c.avatar_text AS client_avatar_text, c.gradient AS client_gradient,
            (SELECT COUNT(*)::int FROM order_checklist ck WHERE ck.order_id = o.id) AS checklist_total,
            (SELECT COUNT(*) FILTER (WHERE ck.done)::int FROM order_checklist ck WHERE ck.order_id = o.id) AS checklist_done,
            (SELECT json_agg(json_build_object(
               'costume_type', oi.costume_type,
               'name', oi.name,
               'description', oi.description,
               'qty', oi.qty,
               'price_per_day', oi.price_per_day
             ))
             FROM order_items oi WHERE oi.order_id = o.id) AS items
     FROM orders o
     LEFT JOIN clients c ON c.id = o.client_id
     LEFT JOIN users au ON au.id = o.assigned_to AND au.tenant_id = o.tenant_id
     WHERE ${conds.join(' AND ')}
     ORDER BY o.number DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );
  const hasMore = rows.length > limit;
  if (hasMore) rows.pop();
  res.json({ ok: true, items: rows, has_more: hasMore, offset, limit });
});

router.get('/:id', async (req, res) => {
  const o = await loadFullOrder(req.params.id, req.tenantId);
  if (!o) return res.status(404).json({ ok: false, error: 'not found' });
  res.json({ ok: true, order: o });
});

router.post('/', requireRole('owner', 'manager'), async (req, res) => {
  const b = req.body ?? {};
  if (!b.issue_date || !b.return_date) {
    return res.status(400).json({ ok: false, error: 'issue_date и return_date обязательны' });
  }
  if (!Array.isArray(b.items) || b.items.length === 0) {
    return res.status(400).json({ ok: false, error: 'нужен хотя бы один костюм' });
  }
  const status = b.status ?? 'conf';
  if (!ALLOWED_STATUS.includes(status)) {
    return res.status(400).json({ ok: false, error: 'неверный статус' });
  }
  if (new Date(b.return_date) < new Date(b.issue_date)) {
    return res.status(400).json({ ok: false, error: 'Дата возврата не может быть раньше даты выдачи' });
  }
  // Клиент (если указан) обязан принадлежать своему прокату — как в /transactions (M1).
  if (b.client_id) {
    const cli = await queryOne(`SELECT id FROM clients WHERE id = $1 AND tenant_id = $2`, [b.client_id, req.tenantId]);
    if (!cli) return res.status(400).json({ ok: false, error: 'client_id не принадлежит вашему прокату' });
  }
  const days = Math.max(1, Math.round((new Date(b.return_date) - new Date(b.issue_date)) / 86400000));

  const client = currentClient(); // закреплённое соединение запроса (app.tenant_id уже стоит)
  try {
    await client.query('BEGIN');

    // Снэпшоты костюмов — только своего тенанта. FOR UPDATE лочит строки на время
    // транзакции → конкурентные брони одного костюма сериализуются (без гонок на складе).
    const costumeIds = [...new Set(b.items.map((i) => i.costume_id))];
    const costumesRes = await client.query(
      `SELECT id, type, name, sizes, total, price_per_day FROM costumes
       WHERE id = ANY($1) AND tenant_id = $2 FOR UPDATE`,
      [costumeIds, req.tenantId]
    );
    const costumeMap = new Map(costumesRes.rows.map((c) => [c.id, c]));

    let subtotal = 0;
    for (const it of b.items) {
      const c = costumeMap.get(it.costume_id);
      if (!c) throw Object.assign(new Error(`Костюм ${it.costume_id} не найден`), { status: 400 });
      subtotal += Number(c.price_per_day) * days * (Number(it.qty) || 1);
    }

    // Проверка брони ПО ДАТАМ: хватает ли свободных единиц на [issue, return].
    // Заменяет старый глобальный счётчик available (он игнорировал даты).
    if (CONSUMES_STOCK(status)) {
      const totals = new Map(costumesRes.rows.map((c) => [c.id, { total: c.total, name: c.name }]));
      await assertAvailable(client, {
        tenantId: req.tenantId, reqQty: requestedQty(b.items), totals,
        from: b.issue_date, to: b.return_date,
      });
    }
    // Скидка не может быть отрицательной или больше стоимости проката (иначе total < 0).
    const addrErr = b.delivery_addr != null ? checkFreeText(b.delivery_addr, { field: 'адрес', max: 200 }) : null;
    if (addrErr) throw Object.assign(new Error(addrErr), { status: 400 });
    const noteErr = b.note != null ? checkFreeText(b.note, { field: 'заметка', max: 1000 }) : null;
    if (noteErr) throw Object.assign(new Error(noteErr), { status: 400 });
    const delivery_addr = String(b.delivery_addr || '').trim() || null;
    const delivery_type = delivery_addr ? 'addr' : 'pickup';
    const discount = Math.min(Math.max(0, Number(b.discount) || 0), subtotal);
    const delivery_cost = 0;
    const total = subtotal - discount + delivery_cost;

    const slot = b.slot === 'pm' ? 'pm' : 'am';
    const deposit = Number.isFinite(Number(b.deposit)) && Number(b.deposit) >= 0 ? Number(b.deposit) : 0;

    const nextRes = await client.query(
      `SELECT COALESCE(MAX(number), 1000) + 1 AS n
         FROM (SELECT number FROM orders WHERE tenant_id = $1 FOR UPDATE) s`,
      [req.tenantId]
    );
    const number = nextRes.rows[0].n;

    const orderRes = await client.query(
      `INSERT INTO orders
        (tenant_id, number, client_id, status, issue_date, return_date, days, slot,
         delivery_type, delivery_addr, delivery_cost,
         subtotal, discount, discount_label, total, deposit,
         paid, payment_method, note, source, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       RETURNING id`,
      [
        req.tenantId, number, b.client_id ?? null, status,
        b.issue_date, b.return_date, days, slot,
        delivery_type, delivery_addr, delivery_cost,
        subtotal, discount, b.discount_label ?? null, total, deposit,
        Boolean(b.paid), b.payment_method ?? null, b.note ?? null, b.source ?? 'manual',
        req.session?.userId ?? null,
      ]
    );
    const orderId = orderRes.rows[0].id;

    for (const it of b.items) {
      const c = costumeMap.get(it.costume_id);
      await client.query(
        `INSERT INTO order_items (order_id, costume_id, costume_type, name, description, price_per_day, qty)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          orderId, c.id, c.type, c.name,
          c.sizes ? `размер ${String(c.sizes).split(',')[0].trim()}` : null,
          c.price_per_day, Number(it.qty) || 1,
        ]
      );
    }

    // (Склад больше не списывается счётчиком — доступность считается по датам из заказов.)

    await client.query(
      `INSERT INTO order_history (order_id, event, detail, user_id) VALUES ($1, 'created', $2, $3)`,
      [orderId, `Заказ №${number} создан`, req.session?.userId ?? null]
    );

    // Оплата на момент создания → фиксируем доход и полную оплату заказа.
    if (Boolean(b.paid) && total > 0) {
      await client.query(`UPDATE orders SET paid_amount = total WHERE id = $1 AND tenant_id = $2`, [orderId, req.tenantId]);
      await recordOrderIncome(client, {
        tenantId: req.tenantId, orderId, clientId: b.client_id ?? null, number,
        amount: total, method: b.payment_method, userId: req.session?.userId,
      });
      await client.query(
        `INSERT INTO order_history (order_id, event, detail, user_id) VALUES ($1, 'paid', $2, $3)`,
        [orderId, 'Оплачено при создании', req.session?.userId ?? null]
      );
    }

    if (status === 'build') await ensureChecklist(client, orderId);
    await recalcClient(client, b.client_id ?? null, req.tenantId);
    await rememberAddress(client, { clientId: b.client_id, tenantId: req.tenantId, addr: delivery_addr });

    // Уведомление о новом заказе.
    const clientName = b.client_id
      ? (await client.query(`SELECT name FROM clients WHERE id = $1 AND tenant_id = $2`, [b.client_id, req.tenantId])).rows[0]?.name
      : null;
    await notifyTenant(client, {
      tenantId: req.tenantId, type: 'new_order', icon: '📥',
      title: `Новый заказ №${number}`,
      subtitle: clientName || `${b.items.length} ${b.items.length === 1 ? 'костюм' : 'костюмов'}`,
      link_to: `/orders/${number}`,
    });

    await client.query('COMMIT');
    await logAudit(req, 'order.create', 'order', number, { total, status, items: b.items.length });
    const full = await loadFullOrder(orderId, req.tenantId);
    res.json({ ok: true, order: full });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    // 23505 = unique_violation (гонка на номере заказа — крайне редко, но возможно)
    if (e.code === '23505' && String(e.constraint || '').includes('number')) {
      return res.status(409).json({ ok: false, error: 'Конфликт номера заказа, повторите запрос' });
    }
    res.status(e.status || 500).json({ ok: false, error: e.message });
  }
});

router.patch('/:id/status', async (req, res) => {
  const { status } = req.body ?? {};
  if (!ALLOWED_STATUS.includes(status)) {
    return res.status(400).json({ ok: false, error: 'неверный статус' });
  }

  const client = currentClient(); // закреплённое соединение запроса (app.tenant_id уже стоит)
  try {
    await client.query('BEGIN');
    const cur = await client.query(
      `SELECT status, client_id, issue_date, return_date, assigned_to FROM orders WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [req.params.id, req.tenantId]
    );
    if (!cur.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'not found' });
    }
    const oldStatus = cur.rows[0].status;
    const { client_id: clientId, issue_date, return_date } = cur.rows[0];
    // Сборщица (employee): только «начать сборку» (conf→build) и только на СВОём
    // назначенном заказе. Любой другой переход — 403. owner/manager — без ограничений.
    if (req.session?.role === 'employee') {
      const isOwn = cur.rows[0].assigned_to === req.session.userId;
      const allowed = oldStatus === 'conf' && status === 'build';
      if (!isOwn || !allowed) {
        await client.query('ROLLBACK');
        return res.status(403).json({ ok: false, error: 'Сборщица может только начать сборку (conf→build) на своём заказе' });
      }
    }
    const wasConsuming = CONSUMES_STOCK(oldStatus);
    const willConsume = CONSUMES_STOCK(status);

    // Возврат заказа в работу (не держал → держит): проверяем бронь по датам,
    // исключая сам заказ. Переход держит → не держит освобождает даты сам собой
    // (доступность считается из заказов). Отдельного счётчика больше нет.
    if (!wasConsuming && willConsume) {
      const items = (await client.query(
        `SELECT costume_id, qty FROM order_items WHERE order_id = $1`, [req.params.id]
      )).rows;
      const costumeIds = [...new Set(items.map((i) => i.costume_id))];
      const costumesRes = await client.query(
        `SELECT id, total, name FROM costumes WHERE id = ANY($1) AND tenant_id = $2 FOR UPDATE`,
        [costumeIds, req.tenantId]
      );
      const totals = new Map(costumesRes.rows.map((c) => [c.id, { total: c.total, name: c.name }]));
      await assertAvailable(client, {
        tenantId: req.tenantId, reqQty: requestedQty(items), totals,
        from: issue_date, to: return_date, excludeOrderId: req.params.id,
      });
    }

    await client.query(`UPDATE orders SET status = $1 WHERE id = $2 AND tenant_id = $3`, [status, req.params.id, req.tenantId]);
    await client.query(
      `INSERT INTO order_history (order_id, event, detail, user_id) VALUES ($1, 'status_changed', $2, $3)`,
      [req.params.id, `Статус → ${status}`, req.session?.userId ?? null]
    );
    if (status === 'build') await ensureChecklist(client, req.params.id);
    await recalcClient(client, clientId, req.tenantId);

    await client.query('COMMIT');
    await logAudit(req, 'order.status', 'order', req.params.id, { from: oldStatus, to: status });
    res.json({ ok: true, order: { id: req.params.id, status } });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(e.status || 500).json({ ok: false, error: e.message });
  }
});

router.patch('/:id/delivery', requireRole('owner', 'manager'), async (req, res) => {
  const b = req.body ?? {};
  const o = await queryOne(
    `SELECT id, client_id FROM orders WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, req.tenantId]
  );
  if (!o) return res.status(404).json({ ok: false, error: 'not found' });
  const addrErr = b.delivery_addr != null ? checkFreeText(b.delivery_addr, { field: 'адрес', max: 200 }) : null;
  if (addrErr) return res.status(400).json({ ok: false, error: addrErr });
  const addr = b.delivery_addr != null ? (String(b.delivery_addr).trim() || null) : undefined;
  await query(
    `UPDATE orders SET
       delivery_addr = COALESCE($3, delivery_addr),
       delivery_type = CASE
         WHEN $3 IS NOT NULL AND $3 <> '' THEN 'addr'
         WHEN $4 THEN 'pickup'
         ELSE delivery_type
       END
     WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, req.tenantId, addr ?? null, addr === null]
  );
  if (addr) {
    await rememberAddress({ query: (sql, params) => query(sql, params) }, {
      clientId: o.client_id, tenantId: req.tenantId, addr,
    });
    await query(
      `INSERT INTO order_history (order_id, event, detail, user_id) VALUES ($1, 'delivery', $2, $3)`,
      [req.params.id, 'Адрес: ' + addr, req.session?.userId ?? null]
    );
  }
  await logAudit(req, 'order.delivery', 'order', req.params.id, { delivery_addr: addr });
  const full = await loadFullOrder(req.params.id, req.tenantId);
  res.json({ ok: true, order: full });
});

// Назначить/переназначить ответственную за сборку. assigned_to обязан быть юзером
// ЭТОГО тенанта с ролью employee/manager (owner сборкой не занимается). null снимает.
// Назначение — прерогатива руководителя (owner/manager).
router.patch('/:id/assign', requireRole('owner', 'manager'), async (req, res) => {
  const assignedTo = req.body?.assigned_to ?? null;
  if (assignedTo !== null) {
    const u = await queryOne(
      `SELECT id FROM users WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE
         AND role IN ('employee', 'manager')`,
      [assignedTo, req.tenantId]
    );
    if (!u) return res.status(400).json({ ok: false, error: 'assigned_to: нужен сотрудник (employee/manager) этого проката' });
  }
  const upd = await queryOne(
    `UPDATE orders SET assigned_to = $1 WHERE id = $2 AND tenant_id = $3 RETURNING id`,
    [assignedTo, req.params.id, req.tenantId]
  );
  if (!upd) return res.status(404).json({ ok: false, error: 'not found' });
  await query(
    `INSERT INTO order_history (order_id, event, detail, user_id) VALUES ($1, 'assigned', $2, $3)`,
    [req.params.id, assignedTo ? 'Назначена ответственная за сборку' : 'Ответственная снята', req.session?.userId ?? null]
  );
  await logAudit(req, 'order.assign', 'order', req.params.id, { assigned_to: assignedTo });
  const full = await loadFullOrder(req.params.id, req.tenantId);
  res.json({ ok: true, order: full });
});

// Отметить заказ собранным / снять отметку. «Собрано» разрешено только при 100%
// отмеченных позиций чек-листа. Статус заказа НЕ меняем (выдачу out делает не сборщица) —
// собранность это отдельный флаг is_assembled. Снятие (assembled:false) доступно всегда.
router.patch('/:id/assembled', async (req, res) => {
  const want = req.body?.assembled !== false; // по умолчанию true
  const ord = await queryOne(`SELECT id, assigned_to FROM orders WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.tenantId]);
  if (!ord) return res.status(404).json({ ok: false, error: 'not found' });
  // Сборщица — только на своём назначенном заказе; owner/manager — без ограничений.
  if (req.session?.role === 'employee' && ord.assigned_to !== req.session.userId) {
    return res.status(403).json({ ok: false, error: 'Отметить сборку можно только на своём назначенном заказе' });
  }

  if (want) {
    const c = await queryOne(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE done)::int AS done
         FROM order_checklist WHERE order_id = $1`,
      [req.params.id]
    );
    if (!c.total || c.done < c.total) {
      return res.status(400).json({ ok: false, error: `Отмечено ${c.done} из ${c.total} — собрать можно только при 100%` });
    }
  }
  await query(`UPDATE orders SET is_assembled = $1 WHERE id = $2 AND tenant_id = $3`, [want, req.params.id, req.tenantId]);
  await query(
    `INSERT INTO order_history (order_id, event, detail, user_id) VALUES ($1, $2, $3, $4)`,
    [req.params.id, want ? 'assembled' : 'status_changed', want ? 'Заказ собран' : 'Отметка «собрано» снята', req.session?.userId ?? null]
  );
  const full = await loadFullOrder(req.params.id, req.tenantId);
  res.json({ ok: true, order: full });
});

// Оценка сборки заказа (⭐1–5 + заметка) — ставит руководитель. Одна оценка на заказ
// (upsert по order_id). employee_id берём из assigned_to заказа. Средняя ⭐ сотрудницы
// считается в GET /team/:id/stats.
router.post('/:id/rating', requireRole('owner', 'manager'), async (req, res) => {
  const stars = Number(req.body?.stars);
  const note = (req.body?.note ?? '').toString().slice(0, 500) || null;
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return res.status(400).json({ ok: false, error: 'stars: целое от 1 до 5' });
  }
  const o = await queryOne(`SELECT id, assigned_to FROM orders WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.tenantId]);
  if (!o) return res.status(404).json({ ok: false, error: 'not found' });
  if (!o.assigned_to) return res.status(400).json({ ok: false, error: 'У заказа нет ответственной за сборку — оценивать некого' });
  const r = await queryOne(
    `INSERT INTO order_ratings (tenant_id, order_id, employee_id, rated_by, stars, note)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (order_id) DO UPDATE SET
       stars = EXCLUDED.stars, note = EXCLUDED.note,
       rated_by = EXCLUDED.rated_by, employee_id = EXCLUDED.employee_id, updated_at = NOW()
     RETURNING stars, note`,
    [req.tenantId, req.params.id, o.assigned_to, req.session.userId, stars, note]
  );
  await logAudit(req, 'order.rating', 'order', req.params.id, { stars });
  res.json({ ok: true, rating: r });
});

// Приём оплаты по заказу (полная или частичная). Пишет доход в транзакции,
// увеличивает paid_amount, ставит paid при полной оплате, пересчитывает долг клиента.
router.post('/:id/payment', requireRole('owner', 'manager'), async (req, res) => {
  const amount = Number(req.body?.amount);
  const method = req.body?.method ?? null;
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ ok: false, error: 'Сумма оплаты должна быть больше нуля' });
  }
  const client = currentClient(); // закреплённое соединение запроса (app.tenant_id уже стоит)
  try {
    await client.query('BEGIN');
    const cur = await client.query(
      `SELECT o.number, o.client_id, o.total, o.paid_amount, c.name AS client_name
       FROM orders o LEFT JOIN clients c ON c.id = o.client_id
       WHERE o.id = $1 AND o.tenant_id = $2 FOR UPDATE OF o`,
      [req.params.id, req.tenantId]
    );
    if (!cur.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Заказ не найден' });
    }
    const { number, client_id, client_name } = cur.rows[0];
    const total = Number(cur.rows[0].total);
    const already = Number(cur.rows[0].paid_amount) || 0;
    const remaining = total - already;
    if (remaining <= 0.009) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: 'Заказ уже полностью оплачен' });
    }
    if (amount > remaining + 0.01) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: `Сумма больше остатка. Осталось оплатить: ${Math.round(remaining)}` });
    }
    const newPaid = already + amount;
    const fullyPaid = newPaid >= total - 0.01;
    await client.query(
      `UPDATE orders SET paid_amount = $1, paid = $2, payment_method = COALESCE($3, payment_method)
       WHERE id = $4 AND tenant_id = $5`,
      [newPaid, fullyPaid, method, req.params.id, req.tenantId]
    );
    await recordOrderIncome(client, {
      tenantId: req.tenantId, orderId: req.params.id, clientId: client_id, number,
      amount, method, userId: req.session?.userId,
    });
    await client.query(
      `INSERT INTO order_history (order_id, event, detail, user_id) VALUES ($1, 'paid', $2, $3)`,
      [req.params.id, fullyPaid ? 'Оплачено полностью' : `Частичная оплата ${Math.round(amount)}`, req.session?.userId ?? null]
    );
    await recalcClient(client, client_id, req.tenantId);
    await notifyTenant(client, {
      tenantId: req.tenantId, type: 'payment', icon: '💰',
      title: fullyPaid ? 'Заказ оплачен полностью' : 'Оплата получена',
      subtitle: `Заказ №${number}${client_name ? ' · ' + client_name : ''} · ${Math.round(amount).toLocaleString('ru-RU')} сум`,
      link_to: `/orders/${number}`,
    });
    await client.query('COMMIT');
    await logAudit(req, 'order.payment', 'order', number, { amount, method, fullyPaid });
    const full = await loadFullOrder(req.params.id, req.tenantId);
    res.json({ ok: true, order: full });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(e.status || 500).json({ ok: false, error: e.message });
  }
});

router.patch('/:id/checklist/:itemId', async (req, res) => {
  const { done } = req.body ?? {};
  // Сборщица — только на своём назначенном заказе; owner/manager — без ограничений.
  if (req.session?.role === 'employee') {
    const own = await queryOne(`SELECT assigned_to FROM orders WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.tenantId]);
    if (!own || own.assigned_to !== req.session.userId) {
      return res.status(403).json({ ok: false, error: 'Отмечать чек-лист можно только на своём назначенном заказе' });
    }
  }
  const r = await queryOne(
    `UPDATE order_checklist oc SET
        done = $3,
        done_at = CASE WHEN $3 THEN NOW() ELSE NULL END,
        done_by = CASE WHEN $3 THEN $4::uuid ELSE NULL END
     FROM orders o
     WHERE oc.id = $2 AND oc.order_id = $1 AND o.id = oc.order_id AND o.tenant_id = $5
     RETURNING oc.*`,
    [req.params.id, req.params.itemId, Boolean(done), req.session?.userId ?? null, req.tenantId]
  );
  if (!r) return res.status(404).json({ ok: false, error: 'not found' });
  // Сняли позицию → заказ больше не «собран» (перестал быть 100%).
  if (!done) {
    await query(`UPDATE orders SET is_assembled = FALSE WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.tenantId]);
  }
  res.json({ ok: true, item: r });
});

router.delete('/:id', requireRole('owner', 'manager'), async (req, res) => {
  const client = currentClient(); // закреплённое соединение запроса (app.tenant_id уже стоит)
  try {
    await client.query('BEGIN');
    const cur = await client.query(
      `SELECT status, client_id FROM orders WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [req.params.id, req.tenantId]
    );
    if (!cur.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'not found' });
    }
    const { client_id } = cur.rows[0];

    // Склад освобождается автоматически: даты этого заказа перестают учитываться,
    // когда его строки удаляются (доступность считается из заказов, не из счётчика).
    await client.query(`DELETE FROM orders WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.tenantId]);
    await recalcClient(client, client_id, req.tenantId);

    await client.query('COMMIT');
    await logAudit(req, 'order.delete', 'order', req.params.id, null);
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
