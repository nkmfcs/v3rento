/* Адреса клиентов: нормализация списка + запоминание нового адреса. */

import { checkFreeText } from './validate.js';

export function parseAddrList(row) {
  const out = [];
  const seen = new Set();
  const add = (s) => {
    const v = String(s || '').trim();
    if (!v) return;
    const k = v.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(v);
  };
  if (row && row.addresses) {
    try {
      const parsed = typeof row.addresses === 'string' ? JSON.parse(row.addresses) : row.addresses;
      if (Array.isArray(parsed)) parsed.forEach(add);
    } catch {
      add(row.addresses);
    }
  }
  if (row) add(row.address);
  return out;
}

export function normalizeAddresses(body) {
  const list = [];
  const seen = new Set();
  const add = (s) => {
    const v = String(s || '').trim();
    if (!v) return null;
    const err = checkFreeText(v, { field: 'адрес', max: 200 });
    if (err) return err;
    const k = v.toLowerCase();
    if (seen.has(k)) return null;
    seen.add(k);
    list.push(v);
    return null;
  };
  if (Array.isArray(body?.addresses)) {
    for (const a of body.addresses) {
      const err = add(a);
      if (err) return { error: err };
    }
  }
  if (body?.address != null) {
    const err = add(body.address);
    if (err) return { error: err };
  }
  return {
    address: list[0] || null,
    addresses: JSON.stringify(list),
    list,
  };
}

export async function rememberAddress(db, { clientId, tenantId, addr }) {
  const text = String(addr || '').trim();
  if (!clientId || !text) return;
  const err = checkFreeText(text, { field: 'адрес', max: 200 });
  if (err) return;
  const res = await db.query(
    `SELECT address, addresses FROM clients WHERE id = $1 AND tenant_id = $2`,
    [clientId, tenantId]
  );
  const row = res?.rows ? res.rows[0] : (Array.isArray(res) ? res[0] : res);
  if (!row) return;
  const list = parseAddrList(row);
  if (list.some((a) => a.toLowerCase() === text.toLowerCase())) return;
  list.push(text);
  await db.query(
    `UPDATE clients SET
       address = COALESCE(NULLIF(address, ''), $3),
       addresses = $4
     WHERE id = $1 AND tenant_id = $2`,
    [clientId, tenantId, text, JSON.stringify(list)]
  );
}
