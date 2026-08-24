/* База: Neon/Postgres если задан DATABASE_URL, иначе локальный PGlite (превью).
   На Railway/проде ОБЯЗАН быть DATABASE_URL — тогда это те же клиенты и заказы,
   что на телефоне. PGlite не импортируется в проде (пакета там нет). */
import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync } from 'node:fs';

const als = new AsyncLocalStorage();
const BUSINESS_TZ = process.env.DB_TIMEZONE || 'Asia/Tashkent';
const USE_PG = !!(process.env.DATABASE_URL && String(process.env.DATABASE_URL).trim());

function serializeValue(v) {
  if (v instanceof Date) {
    const iso = v.toISOString();
    if (iso.endsWith('T00:00:00.000Z')) return iso.slice(0, 10);
    return iso;
  }
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T00:00:00/.test(v)) return v.slice(0, 10);
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
  const rowCount = rows.length || Number(r?.rowCount ?? r?.affectedRows ?? 0);
  return { rows, rowCount };
}

export function currentClient() {
  return als.getStore()?.client ?? null;
}

// ── Neon / Postgres (прод) ──────────────────────────────────────────────────
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
  try {
    await client.query(`SET timezone = '${BUSINESS_TZ.replace(/'/g, "''")}'`);
  } finally {
    client.release();
  }
  console.log('[db] Neon/Postgres (DATABASE_URL)');
  return pgPool;
}

async function pgRawQuery(text, params) {
  const p = pgPool || await initPg();
  return toResult(await p.query(text, params));
}

async function pgWithTenant(tenantId, bypassRls, fn) {
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

// ── PGlite (только превью / нет DATABASE_URL) ───────────────────────────────
let litePromise = null;
let lite = null;
let liteChain = Promise.resolve();

function liteExclusive(fn) {
  if (als.getStore()?.held) return fn();
  let release;
  const next = new Promise((resolve) => { release = resolve; });
  const prev = liteChain;
  liteChain = next;
  return prev.then(() => als.run({ held: true }, async () => {
    try { return await fn(); }
    finally { release(); }
  }));
}

async function initLite() {
  if (litePromise) return litePromise;
  litePromise = (async () => {
    const dir = process.env.PGLITE_DATA || '/workspace/data/rento-pg';
    mkdirSync(dir, { recursive: true });
    const { PGlite } = await import('@electric-sql/pglite');
    const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
    const { bootstrapIfNeeded } = await import('./bootstrap.js');
    const instance = await PGlite.create(dir, { extensions: { pgcrypto } });
    await instance.exec(`SET timezone = '${BUSINESS_TZ.replace(/'/g, "''")}'`);
    await bootstrapIfNeeded(instance);
    if (process.env.NODE_ENV !== 'production') {
      await instance.exec(`DELETE FROM rate_limits`).catch(() => {});
    }
    lite = instance;
    console.log('[db] PGlite (нет DATABASE_URL) →', dir);
    return instance;
  })();
  return litePromise;
}

async function liteRawQuery(text, params) {
  const instance = lite || (await initLite());
  const r = params !== undefined
    ? await instance.query(text, params)
    : await instance.query(text);
  return toResult(r);
}

function liteClient() {
  return {
    async query(text, params) { return liteRawQuery(text, params); },
    release() {},
  };
}

async function liteWithTenant(tenantId, bypassRls, fn) {
  return liteExclusive(async () => {
    const client = liteClient();
    try {
      await liteRawQuery(
        `SELECT set_config('app.tenant_id', $1, false), set_config('app.bypass_rls', $2, false)`,
        [tenantId ?? '', bypassRls ? 'on' : 'off']
      );
      return await als.run({ held: true, client }, fn);
    } finally {
      try {
        await liteRawQuery(
          `SELECT set_config('app.tenant_id', '', false), set_config('app.bypass_rls', 'off', false)`
        );
      } catch { /* ignore */ }
    }
  });
}

// ── общий API ───────────────────────────────────────────────────────────────
export async function waitDb() {
  return USE_PG ? initPg() : initLite();
}

export async function query(text, params) {
  const c = currentClient();
  if (c) {
    const r = await c.query(text, params);
    return r.rows;
  }
  if (USE_PG) return (await pgRawQuery(text, params)).rows;
  return (await liteExclusive(() => liteRawQuery(text, params))).rows;
}

export async function queryOne(text, params) {
  const rows = await query(text, params);
  return rows[0] ?? null;
}

export async function withTenantContext(tenantId, bypassRls, fn) {
  return USE_PG
    ? pgWithTenant(tenantId, bypassRls, fn)
    : liteWithTenant(tenantId, bypassRls, fn);
}

export async function setBypassRls(on) {
  if (USE_PG) {
    await pgRawQuery(`SELECT set_config('app.bypass_rls', $1, false)`, [on ? 'on' : 'off']);
    return;
  }
  await liteRawQuery(`SELECT set_config('app.bypass_rls', $1, false)`, [on ? 'on' : 'off']);
}

export const pool = {
  async query(text, params) {
    if (USE_PG) return pgRawQuery(text, params);
    return liteExclusive(() => liteRawQuery(text, params));
  },
  async connect() {
    if (USE_PG) {
      const p = pgPool || await initPg();
      return p.connect();
    }
    let unlock;
    const held = new Promise((resolve) => { unlock = resolve; });
    const ready = new Promise((resolve) => {
      liteExclusive(async () => {
        resolve({
          query: (text, params) => liteRawQuery(text, params),
          release() { unlock(); },
        });
        await held;
      });
    });
    return ready;
  },
  async end() {
    if (pgPool) await pgPool.end();
  },
};
