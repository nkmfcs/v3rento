import '../server/env.js';
import { pool } from '../server/db.js';

// Доступность теперь считается ПО ДАТАМ из заказов (server/stock.js) — хранимый
// costumes.available больше не источник правды. Держим его = total, чтобы значение
// не вводило в заблуждение и удовлетворяло CHECK (available <= total).
const av = await pool.query(`UPDATE costumes SET available = total RETURNING id`);
console.log('костюмов (available := total, доступность теперь по датам):', av.rowCount);

// Статистика клиентов из реальных заказов (кроме отменённых)
const cl = await pool.query(`
  UPDATE clients c SET
    total_orders  = COALESCE(s.cnt, 0),
    total_spent   = COALESCE(s.spent, 0),
    last_order_at = s.last
  FROM (
    SELECT cl.id,
      COUNT(o.*)::int AS cnt,
      COALESCE(SUM(o.total), 0) AS spent,
      MAX(o.created_at) AS last
    FROM clients cl
    LEFT JOIN orders o ON o.client_id = cl.id AND o.status <> 'cancelled'
    GROUP BY cl.id
  ) s
  WHERE c.id = s.id
  RETURNING c.id
`);
console.log('клиентов пересчитано:', cl.rowCount);

const sample = await pool.query(`SELECT name, total, available FROM costumes ORDER BY name LIMIT 12`);
console.table(sample.rows);

await pool.end();
process.exit(0);
