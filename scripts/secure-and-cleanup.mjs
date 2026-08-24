import '../server/env.js';
import bcryptjs from 'bcryptjs';
import crypto from 'node:crypto';
import { pool } from '../server/db.js';

const q = (t, p) => pool.query(t, p).then(r => r.rows);

// ---- 1) Ротация пароля admin ------------------------------------------------
const newPw = 'Karnaval-' + crypto.randomBytes(6).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 8);
const hash = await bcryptjs.hash(newPw, 10);
const rot = await q(
  `UPDATE users SET password_hash = $1, session_epoch = session_epoch + 1
   WHERE login = 'admin' RETURNING login, name, role`,
  [hash]
);
if (rot.length) {
  console.log('ADMIN ПАРОЛЬ РОТИРОВАН для:', JSON.stringify(rot[0]));
  console.log('НОВЫЙ ПАРОЛЬ admin:', newPw);
} else {
  console.log('admin не найден — пропускаю ротацию');
}

// ---- 2) Чистка тестовых прокатов (login audit_test_%) -----------------------
const testTenants = await q(
  `SELECT DISTINCT tenant_id FROM users WHERE login LIKE 'audit_test_%'`
);
console.log('\nТестовых прокатов к удалению:', testTenants.length);
for (const { tenant_id } of testTenants) {
  await pool.query('BEGIN');
  try {
    await pool.query(`DELETE FROM orders WHERE tenant_id = $1`, [tenant_id]); // cascades items/history/checklist
    await pool.query(`DELETE FROM transactions WHERE tenant_id = $1`, [tenant_id]);
    await pool.query(`DELETE FROM notifications WHERE tenant_id = $1`, [tenant_id]);
    await pool.query(`DELETE FROM costumes WHERE tenant_id = $1`, [tenant_id]);
    await pool.query(`DELETE FROM clients WHERE tenant_id = $1`, [tenant_id]);
    await pool.query(`DELETE FROM invites WHERE tenant_id = $1`, [tenant_id]);
    await pool.query(`DELETE FROM settings WHERE tenant_id = $1`, [tenant_id]);
    await pool.query(`DELETE FROM users WHERE tenant_id = $1`, [tenant_id]);
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenant_id]);
    await pool.query('COMMIT');
    console.log('  удалён тестовый тенант', tenant_id);
  } catch (e) {
    await pool.query('ROLLBACK').catch(() => {});
    console.error('  не удалось удалить', tenant_id, '—', e.message);
  }
}

// ---- 3) Итоговое состояние --------------------------------------------------
const tenants = await q(`SELECT slug, name FROM tenants ORDER BY created_at`);
console.log('\nОставшиеся прокаты:');
tenants.forEach(t => console.log(`  ${t.slug}  —  ${t.name}`));

await pool.end();
process.exit(0);
