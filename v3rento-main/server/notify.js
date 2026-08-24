/* Генерация уведомлений. Уведомления адресны (per user), поэтому создаём строку
 * каждому активному владельцу/менеджеру тенанта. Событийные (новый заказ, оплата)
 * пишутся прямо в обработчиках; временные (просрочка, возврат сегодня) —
 * лениво через ensureReminders() при загрузке ленты, с дедупликацией. */
import { query } from './db.js';

/** Создаёт уведомление для активных owner/manager тенанта (кроме excludeUserId). */
export async function notifyTenant(db, { tenantId, type, icon, title, subtitle = null, link_to = null, excludeUserId = null }) {
  const run = db ? (t, p) => db.query(t, p) : (t, p) => query(t, p);
  await run(
    `INSERT INTO notifications (tenant_id, user_id, type, icon, title, subtitle, link_to)
     SELECT $1, u.id, $2, $3, $4, $5, $6
     FROM users u
     WHERE u.tenant_id = $1 AND u.is_active = TRUE AND u.role IN ('owner', 'manager')
       AND ($7::uuid IS NULL OR u.id <> $7)`,
    [tenantId, type, icon, title, subtitle, link_to, excludeUserId]
  );
}

/** Создаёт уведомление, если такого (tenant+type+link) не было за последние 20 часов. */
async function ensureOne(tenantId, type, link_to, { icon, title, subtitle }) {
  const ex = await query(
    `SELECT 1 FROM notifications
     WHERE tenant_id = $1 AND type = $2 AND link_to = $3
       AND created_at > NOW() - INTERVAL '20 hours' LIMIT 1`,
    [tenantId, type, link_to]
  );
  if (ex.length) return;
  await notifyTenant(null, { tenantId, type, icon, title, subtitle, link_to });
}

/** Ленивая проверка временных напоминаний: просрочка и возврат сегодня.
 *  Заодно переводит выданные заказы с прошедшей датой в статус «просрочка». */
export async function ensureReminders(tenantId) {
  // Выданные заказы, у которых дата возврата уже прошла → статус «просрочка».
  await query(
    `UPDATE orders SET status = 'over'
     WHERE tenant_id = $1 AND status = 'out' AND return_date < CURRENT_DATE`,
    [tenantId]
  );

  const overdue = await query(
    `SELECT o.number, c.name AS client_name FROM orders o
     LEFT JOIN clients c ON c.id = o.client_id
     WHERE o.tenant_id = $1 AND o.status = 'over'`,
    [tenantId]
  );
  for (const o of overdue) {
    await ensureOne(tenantId, 'overdue', `/orders/${o.number}`, {
      icon: '⚠️', title: 'Просрочка возврата',
      subtitle: `Заказ №${o.number}${o.client_name ? ' · ' + o.client_name : ''}`,
    });
  }

  const dueToday = await query(
    `SELECT o.number, c.name AS client_name FROM orders o
     LEFT JOIN clients c ON c.id = o.client_id
     WHERE o.tenant_id = $1 AND o.status = 'out' AND o.return_date = CURRENT_DATE`,
    [tenantId]
  );
  for (const o of dueToday) {
    await ensureOne(tenantId, 'return', `/orders/${o.number}`, {
      icon: '⏰', title: 'Возврат сегодня',
      subtitle: `Заказ №${o.number}${o.client_name ? ' · ' + o.client_name : ''}`,
    });
  }
}
