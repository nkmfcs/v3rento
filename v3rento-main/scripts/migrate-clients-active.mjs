/* Миграция: добавляет clients.is_active для soft-delete клиентов.
   Идемпотентна — безопасно запускать повторно.
   Запуск: node scripts/migrate-clients-active.mjs */
import '../server/env.js';
import { pool } from '../server/db.js';

const r = await pool.query(`
  ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE
`);
console.log('✓ clients.is_active готова', r.command);
await pool.end();
