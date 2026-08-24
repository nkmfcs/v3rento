import '../server/env.js';
import { readFileSync } from 'fs';
import { pool } from '../server/db.js';

const sql = readFileSync(new URL('../db/migration-v2-multitenant.sql', import.meta.url), 'utf8');

try {
  await pool.query(sql);
  console.log('✅ Миграция выполнена успешно');
} catch (e) {
  console.error('❌ Ошибка миграции:', e.message);
  process.exit(1);
}

await pool.end();
process.exit(0);
