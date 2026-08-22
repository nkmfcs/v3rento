/* db.js — Neon/Postgres через переменную DATABASE_URL */
import { AsyncLocalStorage } from 'node:async_hooks';

const als = new AsyncLocalStorage();
const BUSINESS_TZ = process.env.DB_TIMEZONE || 'Asia/Tashkent';

let pgPool = null;

async function initPg() {
  if (pgPool) return pgPool;
  const pg = await import('pg');
  const Pool = pg.default?.Pool ?? pg.Pool;
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
  });
  const client = await pgPool.connect();
  await client.query(`SET timezone = '${BUSINESS_TZ.replace(/'/g, "''")}'`);
  client.release();
  console.log('[db] connected to Neon/Postgres');
  return pgPool;
}

export async function waitDb() {
  return initPg();
}

export function currentClient() {
  return als.getStore()?.client ?? null;
}

function serializeValue(v) {
  if (v instanceof Date) {
    const iso = v.toISOString();
    if (iso.endsWith('T00:00:00.000Z')) return iso.slice(0, 10);
    return iso;
  }
  return v;
}

function serializeRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k] = serializeValue(v);
  return out;
}

function toResult(r) {
  const rows = (r?.rows ?? []).map(serializeRow);
  const rowCount = rows.length || Number(r?.rowCount ?? 0);
  return { rows, rowCount };
}

async function rawQuery(text, params) {
  const p = pgPool || await initPg();
  const r = await p.query(text, params);
  return toResult(r);
}

export async function query(text, params) {
  const c = currentClient();
  if (c) {
    const r = await c.query(text, params);
    return r.rows;
  }
  const r = await rawQuery(text, params);
  return r.rows;
}

export async function queryOne(text, params) {
  const rows = await query(text, params);
  return rows[0] ?? null;
}

export async function withTenantContext(tenantId, bypassRls, fn) {
  const p = pgPool || await initPg();
  const client = await p.connect();
  try {
    await client.query(
      `SELECT set_config('app.tenant_id', $1, false), set_config('app.bypass_rls', $2, false)`,
      [tenantId ?? '', bypassRls ? 'on' : 'off']
    );
    const wrappedClient = {
      query: (text, params) => client.query(text, params).then(toResult),
      release: () => {},
    };
    return await als.run({ client: wrappedClient }, fn);
  } finally {
    try {
      await client.query(
        `SELECT set_config('app.tenant_id', '', false), set_config('app.bypass_rls', 'off', false)`
      );
    } catch { /* ignore */ }
    client.release();
  }
}

export async function setBypassRls(on) {
  await rawQuery(`SELECT set_config('app.bypass_rls', $1, false)`, [on ? 'on' : 'off']);
}

export const pool = {
  async query(text, params) {
    return rawQuery(text, params);
  },
  async connect() {
    const p = pgPool || await initPg();
    return p.connect();
  },
  async end() {
    if (pgPool) await pgPool.end();
  },
};
