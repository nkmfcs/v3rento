import '../server/env.js';
import { readFileSync } from 'fs';
import { pool } from '../server/db.js';

const file = process.argv[2];
if (!file) { console.error('usage: node scripts/run-sql.mjs <path-from-project-root>'); process.exit(1); }

const sql = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
try {
  await pool.query(sql);
  console.log('OK:', file);
} catch (e) {
  console.error('ERR:', e.message);
  await pool.end();
  process.exit(1);
}
await pool.end();
process.exit(0);
