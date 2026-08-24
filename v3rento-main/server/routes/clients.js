/* Клиенты */
import { Router } from 'express';
import { query, queryOne } from '../db.js';
import { requireRole } from '../auth.js';
import { checkEnum, checkAvatarText, checkGradient } from '../validate.js';
import { logAudit } from '../audit.js';
import { normalizeAddresses, parseAddrList } from '../addresses.js';

function validateClientFields({ type, gradient, avatar_text }) {
  return checkEnum(type, ['person', 'org'], 'type')
    || checkAvatarText(avatar_text)
    || checkGradient(gradient);
}

function withAddrs(c) {
  if (!c) return c;
  const list = parseAddrList(c);
  return { ...c, address: list[0] || c.address || null, addresses: list };
}

const router = Router();

router.get('/', async (req, res) => {
  const rows = await query(
    `SELECT id, name, type, phone, email, telegram, address, addresses, avatar_text, gradient,
            total_orders, total_spent, debt, last_order_at
     FROM clients WHERE tenant_id = $1 AND is_active = TRUE ORDER BY name`,
    [req.tenantId]
  );
  res.json({ ok: true, items: rows.map(withAddrs) });
});

router.get('/:id', async (req, res) => {
  const c = await queryOne(
    `SELECT * FROM clients WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, req.tenantId]
  );
  if (!c) return res.status(404).json({ ok: false, error: 'not found' });
  const orders = await query(
    `SELECT id, number, status, issue_date, return_date, total
     FROM orders WHERE client_id = $1 AND tenant_id = $2
     ORDER BY created_at DESC LIMIT 50`,
    [req.params.id, req.tenantId]
  );
  res.json({ ok: true, client: withAddrs(c), orders });
});

router.post('/', requireRole('owner', 'manager'), async (req, res) => {
  const { name, type, phone, email, telegram, note, avatar_text, gradient } = req.body ?? {};
  if (!name) return res.status(400).json({ ok: false, error: 'name обязательно' });
  const vErr = validateClientFields({ type, gradient, avatar_text });
  if (vErr) return res.status(400).json({ ok: false, error: vErr });
  const addrs = normalizeAddresses(req.body ?? {});
  if (addrs.error) return res.status(400).json({ ok: false, error: addrs.error });
  const r = await queryOne(
    `INSERT INTO clients (tenant_id, name, type, phone, email, telegram, address, addresses, note, avatar_text, gradient)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      req.tenantId,
      name,
      type ?? 'person',
      phone ?? null, email ?? null, telegram ?? null,
      addrs.address, addrs.addresses, note ?? null,
      avatar_text ?? null, gradient ?? null,
    ]
  );
  await logAudit(req, 'client.create', 'client', r.id, { name });
  res.json({ ok: true, client: withAddrs(r) });
});

router.put('/:id', requireRole('owner', 'manager'), async (req, res) => {
  const { name, type, phone, email, telegram, note, avatar_text, gradient } = req.body ?? {};
  const vErr = validateClientFields({ type, gradient, avatar_text });
  if (vErr) return res.status(400).json({ ok: false, error: vErr });
  const addrs = normalizeAddresses(req.body ?? {});
  if (addrs.error) return res.status(400).json({ ok: false, error: addrs.error });
  const hasAddr = req.body?.address != null || req.body?.addresses != null;
  const r = await queryOne(
    `UPDATE clients SET
       name = COALESCE($3, name),
       type = COALESCE($4, type),
       phone = COALESCE($5, phone),
       email = COALESCE($6, email),
       telegram = COALESCE($7, telegram),
       address = CASE WHEN $12 THEN $8 ELSE address END,
       addresses = CASE WHEN $12 THEN $9 ELSE addresses END,
       note = COALESCE($10, note),
       avatar_text = COALESCE($11, avatar_text),
       gradient = COALESCE($13, gradient)
     WHERE id = $1 AND tenant_id = $2 RETURNING *`,
    [req.params.id, req.tenantId, name ?? null, type ?? null, phone ?? null, email ?? null,
     telegram ?? null, addrs.address, addrs.addresses, note ?? null, avatar_text ?? null,
     hasAddr, gradient ?? null]
  );
  if (!r) return res.status(404).json({ ok: false, error: 'not found' });
  await logAudit(req, 'client.update', 'client', req.params.id, { name: r.name });
  res.json({ ok: true, client: withAddrs(r) });
});

router.delete('/:id', requireRole('owner', 'manager'), async (req, res) => {
  const r = await queryOne(
    `UPDATE clients SET is_active = FALSE WHERE id = $1 AND tenant_id = $2 RETURNING id`,
    [req.params.id, req.tenantId]
  );
  if (!r) return res.status(404).json({ ok: false, error: 'not found' });
  await logAudit(req, 'client.delete', 'client', req.params.id, null);
  res.json({ ok: true });
});

export default router;
