/* Миграция: users.session_epoch для отзыва JWT (logout-everywhere / смена пароля).
   Идемпотентна. Запуск: node scripts/migrate-session-epoch.mjs */
import '../server/env.js';
import { pool } from '../server/db.js';

const r = await pool.query(`
  ALTER TABLE users
  ADD COLUMN IF NOT EXISTS session_epoch INT NOT NULL DEFAULT 0
`);
console.log('✓ users.session_epoch готова', r.command);
await pool.end();
