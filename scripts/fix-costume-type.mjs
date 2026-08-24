import '../server/env.js';
import { pool } from '../server/db.js';

const introspect = () => pool.query(
  `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'costumes'::regclass ORDER BY conname`
).then(r => r.rows);

const before = await introspect();
console.log('BEFORE:'); before.forEach(c => console.log(`  ${c.conname}: ${c.def}`));

const uniq = before.find(c => /^UNIQUE \(type\)/.test(c.def));
try {
  await pool.query('BEGIN');
  if (uniq) {
    await pool.query(`ALTER TABLE costumes DROP CONSTRAINT "${uniq.conname}"`);
    console.log('dropped global unique', uniq.conname);
  } else {
    console.log('no global UNIQUE(type) — already fixed?');
  }
  const has = before.some(c => /UNIQUE \(tenant_id, type\)/.test(c.def));
  if (!has) {
    await pool.query(`ALTER TABLE costumes ADD CONSTRAINT costumes_tenant_type_uniq UNIQUE (tenant_id, type)`);
    console.log('added costumes_tenant_type_uniq (tenant_id, type)');
  }
  await pool.query('COMMIT');
} catch (e) {
  await pool.query('ROLLBACK').catch(() => {});
  console.error('ROLLBACK —', e.message);
  await pool.end();
  process.exit(1);
}

const after = await introspect();
console.log('AFTER:'); after.forEach(c => console.log(`  ${c.conname}: ${c.def}`));
await pool.end();
process.exit(0);
