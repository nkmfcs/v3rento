/* PGlite-адаптер с интерфейсом node-postgres.
 *
 * Прод ходит в Neon через `pg`. В этой среде отдельного Postgres нет,
 * поэтому тот же API (pool / query / withTenantContext) работает поверх
 * встроенного PGlite. Данные лежат в каталоге PGLITE_DATA и переживают рестарт.
 */
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync } from 'node:fs';
import { bootstrapIfNeeded } from './bootstrap.js';

const als = new AsyncLocalStorage();
const BUSINESS_TZ = process.env.DB_TIMEZONE || 'Asia/Tashkent';
const DATA_DIR = process.env.PGLITE_DATA || '/workspace/data/rento-pg';

mkdirSync(DATA_DIR, { recursive: true });

let dbPromise = null;
let db = null;

function startDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const instance = await PGlite.create(DATA_DIR, { extensions: { pgcrypto } });
      await instance.exec(`SET timezone = '${BUSINESS_TZ.replace(/'/g, "''")}'`);
      await bootstrapIfNeeded(instance);
      // Сброс лимитера входов: в превью наши проверки и клики быстро упираются в 10/15 мин.
      if (process.env.NODE_ENV !== 'production') {
        await instance.exec(`DELETE FROM rate_limits`).catch(() => {});
      }
      db = instance;
      return instance;
    })();
  }
  return dbPromise;
}

export function waitDb() {
  return startDb();
}

/** Соединение текущего запроса (если запрос идёт в тенант-контексте). */
export function currentClient() {
  return als.getStore()?.client ?? null;
}

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
  // SELECT: affectedRows === 0 даже при найденных строках — берём rows.length.
  // UPDATE/DELETE без RETURNING: rows пустой, нужен affectedRows.
  const rowCount = rows.length || Number(r?.affectedRows ?? 0);
  return { rows, rowCount };
}

async function rawQuery(text, params) {
  const instance = db || (await startDb());
  const r = params !== undefined
    ? await instance.query(text, params)
    : await instance.query(text);
  return toResult(r);
}

let chain = Promise.resolve();

function exclusive(fn) {
  if (als.getStore()?.held) return fn();
  let release;
  const next = new Promise((resolve) => { release = resolve; });
  const prev = chain;
  chain = next;
  return prev.then(() => als.run({ held: true }, async () => {
    try {
      return await fn();
    } finally {
      release();
    }
  }));
}

function makeClient() {
  return {
    async query(text, params) {
      return rawQuery(text, params);
    },
    release() {},
  };
}

export async function query(text, params) {
  const c = currentClient();
  const r = await (c ? c.query(text, params) : exclusive(() => rawQuery(text, params)));
  return r.rows;
}

export async function queryOne(text, params) {
  const rows = await query(text, params);
  return rows[0] ?? null;
}

/**
 * Выполняет fn в контексте тенанта: ставит app.tenant_id на время запроса.
 * Всё, что внутри (включая query/queryOne), видит только строки этого проката.
 */
export async function withTenantContext(tenantId, bypassRls, fn) {
  return exclusive(async () => {
    const client = makeClient();
    try {
      await rawQuery(
        `SELECT set_config('app.tenant_id', $1, false), set_config('app.bypass_rls', $2, false)`,
        [tenantId ?? '', bypassRls ? 'on' : 'off']
      );
      return await als.run({ held: true, client }, fn);
    } finally {
      try {
        await rawQuery(
          `SELECT set_config('app.tenant_id', '', false), set_config('app.bypass_rls', 'off', false)`
        );
      } catch { /* ignore */ }
    }
  });
}

export async function setBypassRls(on) {
  await rawQuery(`SELECT set_config('app.bypass_rls', $1, false)`, [on ? 'on' : 'off']);
}

/** Совместимость с `pg.Pool`: query / connect / end. */
export const pool = {
  async query(text, params) {
    return exclusive(() => rawQuery(text, params));
  },
  async connect() {
    let unlock;
    const held = new Promise((resolve) => { unlock = resolve; });
    const ready = new Promise((resolve) => {
      exclusive(async () => {
        resolve({
          query: (text, params) => rawQuery(text, params),
          release() { unlock(); },
        });
        await held;
      });
    });
    return ready;
  },
  async end() {},
};
