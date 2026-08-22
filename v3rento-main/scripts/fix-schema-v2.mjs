import '../server/env.js';
import { pool } from '../server/db.js';

const q = (t, p) => pool.query(t, p).then(r => r.rows);

const introspect = () => q(`
  SELECT conname, pg_get_constraintdef(oid) AS def, conrelid::regclass::text AS tbl
  FROM pg_constraint
  WHERE conrelid IN ('orders'::regclass, 'settings'::regclass)
  ORDER BY tbl, conname
`);

const before = await introspect();
console.log('=== BEFORE ===');
before.forEach(c => console.log(`${c.tbl}.${c.conname}  =>  ${c.def}`));

try {
  await pool.query('BEGIN');

  // ---- C2: orders.number global UNIQUE -> UNIQUE (tenant_id, number) ----
  const numUniq = before.find(c => c.tbl === 'orders' && /^UNIQUE \(number\)/.test(c.def));
  if (numUniq) {
    await pool.query(`ALTER TABLE orders DROP CONSTRAINT "${numUniq.conname}"`);
    console.log(`C2: dropped global unique ${numUniq.conname}`);
  } else {
    console.log('C2: no global UNIQUE(number) — already fixed?');
  }
  const hasComposite = before.some(c => c.tbl === 'orders' && /UNIQUE \(tenant_id, number\)/.test(c.def));
  if (!hasComposite) {
    await pool.query(`ALTER TABLE orders ADD CONSTRAINT orders_tenant_number_uniq UNIQUE (tenant_id, number)`);
    console.log('C2: added orders_tenant_number_uniq (tenant_id, number)');
  }

  // ---- C3: settings single-row (id=1) -> PK on tenant_id ----
  for (const c of before.filter(c => c.tbl === 'settings')) {
    const drop =
      c.def.startsWith('PRIMARY KEY') ||
      c.def.startsWith('CHECK') ||
      /^UNIQUE \(tenant_id\)/.test(c.def) ||
      /^UNIQUE \(id\)/.test(c.def);
    if (drop) {
      await pool.query(`ALTER TABLE settings DROP CONSTRAINT "${c.conname}"`);
      console.log(`C3: dropped settings constraint ${c.conname}`);
    }
  }
  await pool.query(`UPDATE settings SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL`);
  await pool.query(`ALTER TABLE settings ALTER COLUMN tenant_id SET NOT NULL`);
  await pool.query(`ALTER TABLE settings ADD PRIMARY KEY (tenant_id)`);
  await pool.query(`ALTER TABLE settings DROP COLUMN IF EXISTS id`);
  console.log('C3: settings re-keyed on tenant_id, id column dropped');

  await pool.query('COMMIT');
  console.log('COMMIT ok');
} catch (e) {
  await pool.query('ROLLBACK').catch(() => {});
  console.error('ROLLBACK —', e.message);
  await pool.end();
  process.exit(1);
}

const after = await introspect();
console.log('=== AFTER ===');
after.forEach(c => console.log(`${c.tbl}.${c.conname}  =>  ${c.def}`));
const cols = await q(`SELECT column_name FROM information_schema.columns WHERE table_name='settings' ORDER BY ordinal_position`);
console.log('settings columns:', cols.map(c => c.column_name).join(', '));

await pool.end();
process.exit(0);
