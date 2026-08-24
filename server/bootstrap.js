/* Первичная схема + миграции + демо-сид для локального PGlite. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import bcryptjs from 'bcryptjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TID = '00000000-0000-0000-0000-000000000001';

const MIGRATIONS = [
  'schema.sql',
  'migration-v2-multitenant.sql',
  'migration-v3-constraints.sql',
  'migration-v4-leads.sql',
  'migration-v5-rate-limit.sql',
  'migration-v6-payments.sql',
  'migration-v7-rls.sql',
  'migration-v8-rls-role.sql',
  'migration-v9-assembler.sql',
  'migration-v10-audit.sql',
  'migration-v11-ratings.sql',
  'migration-v12-media-delivery.sql',
  'migration-v13-client-addresses.sql',
  'migration-v14-room-bins.sql',
  'migration-v15-order-slot.sql',
  'migration-v16-indexes.sql',
  'migration-v17-status-checks.sql',
  'migration-v18-order-number-per-tenant.sql',
];

export async function bootstrapIfNeeded(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.exec(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
        CREATE ROLE app_rls NOLOGIN NOBYPASSRLS;
      END IF;
    END $$;
  `);

  for (const file of MIGRATIONS) {
    const already = await db.query(`SELECT 1 FROM _schema_migrations WHERE id = $1`, [file]);
    if (already.rows.length) continue;
    const sql = readFileSync(join(ROOT, 'db', file), 'utf8');
    try {
      await db.exec(sql);
      await db.query(`INSERT INTO _schema_migrations (id) VALUES ($1)`, [file]);
      console.log(`  ✓ ${file}`);
    } catch (e) {
      const msg = String(e.message || e);
      if (file.includes('v8') || /role .* does not exist/i.test(msg)) {
        console.warn(`  ⊝ ${file} пропущен: ${msg}`);
        await db.query(`INSERT INTO _schema_migrations (id) VALUES ($1) ON CONFLICT DO NOTHING`, [file]);
        continue;
      }
      throw new Error(`Миграция ${file}: ${msg}`);
    }
  }

  const admin = await db.query(`SELECT id FROM users WHERE login = 'admin'`);
  if (admin.rows.length) return;

  console.log('→ Чистый старт: владелец без демо-данных');
  await seedFresh(db);
  console.log('  ✓ Готово. вход: admin / admin12345');
}

async function seedFresh(db) {
  await db.query(`SELECT set_config('app.bypass_rls', 'on', false), set_config('app.tenant_id', $1, false)`, [TID]);

  await db.query(
    `INSERT INTO tenants (id, slug, name) VALUES ($1, 'rento', 'RENTO')
     ON CONFLICT (id) DO NOTHING`,
    [TID]
  );

  const adminHash = await bcryptjs.hash('admin12345', 10);
  await db.query(
    `INSERT INTO users (tenant_id, login, password_hash, name, role, avatar_text, gradient)
     VALUES ($1,'admin',$2,'Владелец','owner','В','#7C9CFF,#3D5AFE')`,
    [TID, adminHash]
  );

  await db.query(
    `INSERT INTO settings (tenant_id, shop_name, address, phone, work_hours, deposit_pct)
     VALUES ($1, 'RENTO', '', '', '10:00–20:00', 50)
     ON CONFLICT (tenant_id) DO UPDATE SET shop_name = EXCLUDED.shop_name`,
    [TID]
  );
}
