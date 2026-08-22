#!/usr/bin/env node
/**
 * db-reset.mjs — полный сброс БД и применение свежей схемы.
 * Использует DATABASE_URL из .env.local.
 *
 * Запуск: npm run db:reset
 *
 * ВНИМАНИЕ: drops everything in public schema.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function loadEnv() {
  const raw = readFileSync(join(ROOT, '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

async function main() {
  loadEnv();
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL не задан в .env.local');
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log('✓ Подключение к БД');

  console.log('→ Сбрасываю public schema целиком…');
  await client.query('DROP SCHEMA public CASCADE');
  await client.query('CREATE SCHEMA public');
  await client.query('GRANT ALL ON SCHEMA public TO neondb_owner');
  await client.query('GRANT ALL ON SCHEMA public TO public');
  console.log('  ✓ public сброшена');

  console.log('→ Применяю db/schema.sql…');
  const schema = readFileSync(join(ROOT, 'db', 'schema.sql'), 'utf8');
  await client.query(schema);
  console.log('  ✓ Схема применена');

  const r = await client.query(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'`
  );
  console.log(`\n✓ Готово. Таблиц: ${r.rows[0].n}`);
  await client.end();
}

main().catch((e) => {
  console.error('Ошибка:', e.message);
  process.exit(1);
});
