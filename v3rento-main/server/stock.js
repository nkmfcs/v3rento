/* Доступность склада ПО ДАТАМ. Источник правды — заказы, а не счётчик `available`.
 *
 * Костюм занят заказом, если:
 *   1) статус заказа реально «держит» склад (HOLDING_STATUSES), и
 *   2) интервал заказа [issue_date, return_date] пересекается с запрошенным
 *      периодом [from, to] хотя бы одним днём (границы включительно — день
 *      возврата считается занятым: костюму нужна чистка/подготовка).
 *
 * Чтобы разрешить выдачу в день чужого возврата (day-to-day turnover),
 * замените в условии `o.return_date >= $from` на `o.return_date > $from`. */

// Статусы, занимающие костюм на складе. Совпадает с CONSUMES_STOCK в routes/orders.js:
// «Запрос» (req) — ещё не бронь; closed/cancelled — уже не держат.
export const HOLDING_STATUSES = ['book', 'conf', 'build', 'out', 'over'];

/**
 * Сколько единиц каждого костюма уже занято на период [from, to].
 * @param {object} db закреплённое соединение запроса (внутри транзакции)
 * @returns {Promise<Map<string, number>>} costume_id → занятые единицы
 */
export async function bookedUnits(db, { tenantId, costumeIds, from, to, excludeOrderId = null }) {
  if (!costumeIds || costumeIds.length === 0) return new Map();
  const { rows } = await db.query(
    `SELECT oi.costume_id, COALESCE(SUM(oi.qty), 0)::int AS busy
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
      WHERE o.tenant_id = $1
        AND oi.costume_id = ANY($2::uuid[])
        AND o.status = ANY($3)
        AND o.issue_date <= $5 AND o.return_date >= $4
        AND ($6::uuid IS NULL OR o.id <> $6)
      GROUP BY oi.costume_id`,
    [tenantId, costumeIds, HOLDING_STATUSES, from, to, excludeOrderId]
  );
  const m = new Map();
  for (const r of rows) m.set(r.costume_id, Number(r.busy));
  return m;
}

/**
 * Проверка брони: для каждого костюма из reqQty (Map costume_id→нужное кол-во)
 * убеждаемся, что на [from, to] хватает свободных единиц. Бросает 409 с понятным
 * текстом при нехватке. `totals` — Map costume_id → { total, name }.
 * ВАЖНО: перед вызовом строки costumes нужно залочить FOR UPDATE (сериализация
 * конкурентных броней одного костюма).
 */
export async function assertAvailable(db, { tenantId, reqQty, totals, from, to, excludeOrderId = null }) {
  const costumeIds = [...reqQty.keys()];
  const busy = await bookedUnits(db, { tenantId, costumeIds, from, to, excludeOrderId });
  for (const [cid, qty] of reqQty) {
    const info = totals.get(cid) || {};
    const total = Number(info.total) || 0;
    const free = total - (busy.get(cid) || 0);
    if (qty > free) {
      throw Object.assign(
        new Error(`«${info.name ?? 'Костюм'}» — на выбранные даты свободно ${Math.max(0, free)} из ${total}`),
        { status: 409 }
      );
    }
  }
}
