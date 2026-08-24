/* Костюмы: список / детали / создать / обновить / удалить */
import { Router } from 'express';
import { query, queryOne } from '../db.js';
import { requireRole } from '../auth.js';
import { HOLDING_STATUSES } from '../stock.js';
import { checkFreeText } from '../validate.js';
import { logAudit } from '../audit.js';
import { putObject, deleteObject, publicUrl } from '../s3.js';
import express from 'express';

const router = Router();

// «Свободно сейчас» = total − единицы, занятые заказами, пересекающими СЕГОДНЯ.
// Источник правды — заказы (не хранимый счётчик), поэтому значение не дрейфует.
// p — плейсхолдер параметра со списком HOLDING_STATUSES (позиция зависит от запроса).
const availToday = (p) => `GREATEST(0, c.total - COALESCE((
  SELECT SUM(oi.qty)::int FROM order_items oi JOIN orders o ON o.id = oi.order_id
  WHERE oi.costume_id = c.id AND o.status = ANY(${p})
    AND o.issue_date <= CURRENT_DATE AND o.return_date >= CURRENT_DATE), 0))`;

const MAX_PHOTOS = 10;
const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function sniffImage(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function photoPublicUrl(id, objectKey) {
  return publicUrl(objectKey) || '/api/media/' + id;
}

async function photosFor(costumeIds, tenantId) {
  if (!costumeIds.length) return {};
  const rows = await query(
    `SELECT id, costume_id, sort, object_key FROM costume_photos
     WHERE tenant_id = $1 AND costume_id = ANY($2)
     ORDER BY sort, created_at`,
    [tenantId, costumeIds]
  );
  const by = {};
  for (const p of rows) {
    const item = { id: p.id, url: photoPublicUrl(p.id, p.object_key), sort: p.sort };
    if (!by[p.costume_id]) by[p.costume_id] = [];
    by[p.costume_id].push(item);
  }
  return by;
}

function attachPhotos(items, by) {
  return items.map((c) => {
    const photos = by[c.id] || [];
    return { ...c, photos, cover_url: photos[0]?.url || '' };
  });
}

router.get('/', async (req, res) => {
  const rows = await query(
    `SELECT c.id, c.type, c.name, c.sizes, c.total, ${availToday('$2')} AS available,
            c.price_per_day, c.status, c.category, c.note, c.location, c.rent_days_default, c.created_at
     FROM costumes c WHERE c.tenant_id = $1 AND c.is_active = TRUE
     ORDER BY c.name`,
    [req.tenantId, HOLDING_STATUSES]
  );
  const by = await photosFor(rows.map((r) => r.id), req.tenantId);
  res.json({ ok: true, items: attachPhotos(rows, by) });
});

// Доступность на период [from, to] — для формы заказа (сколько свободно на выбранные даты).
// ВАЖНО: маршрут объявлен ДО '/:id', иначе 'availability' попадёт в :id.
router.get('/availability', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ ok: false, error: 'from и to обязательны' });
  const rows = await query(
    `SELECT c.id, c.total,
            GREATEST(0, c.total - COALESCE((
              SELECT SUM(oi.qty)::int FROM order_items oi JOIN orders o ON o.id = oi.order_id
              WHERE oi.costume_id = c.id AND o.status = ANY($4)
                AND o.issue_date <= $3 AND o.return_date >= $2), 0)) AS free
     FROM costumes c WHERE c.tenant_id = $1 AND c.is_active = TRUE`,
    [req.tenantId, from, to, HOLDING_STATUSES]
  );
  res.json({ ok: true, items: rows });
});

router.get('/:id', async (req, res) => {
  const c = await queryOne(
    `SELECT c.*, ${availToday('$3')} AS available_today
     FROM costumes c WHERE c.id = $1 AND c.tenant_id = $2 AND c.is_active = TRUE`,
    [req.params.id, req.tenantId, HOLDING_STATUSES]
  );
  if (!c) return res.status(404).json({ ok: false, error: 'not found' });
  c.available = c.available_today; delete c.available_today;
  const by = await photosFor([c.id], req.tenantId);
  c.photos = by[c.id] || [];
  c.cover_url = c.photos[0]?.url || '';

  const history = await query(
    `SELECT o.id, o.number, o.status, o.issue_date, o.return_date, o.total, c.name AS client_name
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     LEFT JOIN clients c ON c.id = o.client_id
     WHERE oi.costume_id = $1 AND o.tenant_id = $2
     ORDER BY o.created_at DESC
     LIMIT 50`,
    [req.params.id, req.tenantId]
  );
  res.json({ ok: true, costume: c, history });
});

router.post('/', requireRole('owner', 'manager'), async (req, res) => {
  const { type, name, sizes, total, available, price_per_day, status, category, note, location } = req.body ?? {};
  if (!name || !type) {
    return res.status(400).json({ ok: false, error: 'name и type обязательны' });
  }
  // type — слаг-артикул (свободный текст): длина + без < > " ' (defense-in-depth).
  const typeErr = checkFreeText(type, { field: 'type', max: 40 });
  if (typeErr) return res.status(400).json({ ok: false, error: typeErr });
  const locErr = checkFreeText(location, { field: 'location', max: 60 });
  if (locErr) return res.status(400).json({ ok: false, error: locErr });
  const t = Number(total) || 1;
  const a = available != null ? Math.min(t, Math.max(0, Number(available) || 0)) : t;
  try {
    const r = await queryOne(
      `INSERT INTO costumes (tenant_id, type, name, sizes, total, available, price_per_day, status, category, note, location)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.tenantId, type, name, sizes ?? null, t, a, Number(price_per_day) || 0, status ?? 'avail', category ?? null, note ?? null, location ?? null]
    );
    await logAudit(req, 'costume.create', 'costume', r.id, { name, type });
    res.json({ ok: true, costume: { ...r, photos: [], cover_url: '' } });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ ok: false, error: 'Костюм с таким type уже есть' });
    throw e;
  }
});

router.put('/:id', requireRole('owner', 'manager'), async (req, res) => {
  const { name, sizes, total, available, price_per_day, status, category, note, location } = req.body ?? {};
  const locErr = checkFreeText(location, { field: 'location', max: 60 });
  if (locErr) return res.status(400).json({ ok: false, error: locErr });
  const cur = await queryOne(
    `SELECT total, available FROM costumes WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, req.tenantId]
  );
  if (!cur) return res.status(404).json({ ok: false, error: 'not found' });

  let t = cur.total;
  if (total !== undefined) {
    t = Number(total);
    if (!Number.isFinite(t) || t < 0) {
      return res.status(400).json({ ok: false, error: 'total должен быть неотрицательным числом' });
    }
  }
  // available всегда приводим к диапазону [0, t]. Если не задан — берём текущее,
  // но обрезаем сверху новым total, иначе при уменьшении total нарушится
  // CHECK (available <= total) и запрос падал бы 500-й.
  const rawAvail = available !== undefined ? Number(available) : cur.available;
  const a = Math.min(t, Math.max(0, Number.isFinite(rawAvail) ? rawAvail : 0));

  try {
    const r = await queryOne(
      `UPDATE costumes SET
         name = COALESCE($3, name),
         sizes = COALESCE($4, sizes),
         total = $5,
         available = $6,
         price_per_day = COALESCE($7, price_per_day),
         status = COALESCE($8, status),
         category = COALESCE($9, category),
         note = COALESCE($10, note),
         location = COALESCE($11, location)
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [req.params.id, req.tenantId, name ?? null, sizes ?? null, t, a, price_per_day ?? null, status ?? null, category ?? null, note ?? null, location ?? null]
    );
    await logAudit(req, 'costume.update', 'costume', req.params.id, { name: r?.name });
    const by = await photosFor([r.id], req.tenantId);
    const [withPh] = attachPhotos([r], by);
    res.json({ ok: true, costume: withPh });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ ok: false, error: 'Костюм с таким type уже есть' });
    throw e;
  }
});

router.delete('/:id', requireRole('owner', 'manager'), async (req, res) => {
  const r = await queryOne(
    `UPDATE costumes SET is_active = FALSE WHERE id = $1 AND tenant_id = $2 RETURNING id`,
    [req.params.id, req.tenantId]
  );
  if (!r) return res.status(404).json({ ok: false, error: 'not found' });
  await logAudit(req, 'costume.delete', 'costume', req.params.id, null);
  res.json({ ok: true });
});

router.post(
  '/:id/photos',
  requireRole('owner', 'manager'),
  express.raw({
    type: (req) => {
      const t = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      return !t || t === 'application/octet-stream' || t.startsWith('image/');
    },
    limit: MAX_BYTES,
  }),
  async (req, res) => {
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || []);
    if (!buf.length) return res.status(400).json({ ok: false, error: 'Пустой файл' });
    if (buf.length > MAX_BYTES) return res.status(400).json({ ok: false, error: 'Файл больше 3 МБ' });
    const mime = sniffImage(buf);
    const ext = mime && ALLOWED_MIME[mime];
    if (!ext) return res.status(400).json({ ok: false, error: 'Только JPEG, PNG или WebP' });
    const costume = await queryOne(
      `SELECT id FROM costumes WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE`,
      [req.params.id, req.tenantId]
    );
    if (!costume) return res.status(404).json({ ok: false, error: 'not found' });
    const count = await queryOne(
      `SELECT COUNT(*)::int AS n FROM costume_photos WHERE costume_id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenantId]
    );
    if ((count?.n || 0) >= MAX_PHOTOS) {
      return res.status(400).json({ ok: false, error: `Не больше ${MAX_PHOTOS} фото на костюм` });
    }
    const photoId = crypto.randomUUID();
    const key = `${req.tenantId}/${req.params.id}/${photoId}.${ext}`;
    let stored;
    try {
      stored = await putObject(key, buf, mime);
    } catch (e) {
      console.error('[photos] storage', e);
      const msg = String(e && e.message || e);
      const unauthorized = /401|Unauthorized|403|SignatureDoesNotMatch/i.test(msg);
      return res.status(502).json({
        ok: false,
        error: unauthorized
          ? 'R2 отклонил ключи (401). S3_ENDPOINT = https://<ACCOUNT_ID>.r2.cloudflarestorage.com (не r2.dev), S3_REGION = auto, ключи — Access Key ID и Secret от R2 API Token.'
          : 'Не удалось сохранить фото в облако',
      });
    }
    const sort = count?.n || 0;
    const row = await queryOne(
      `INSERT INTO costume_photos (id, tenant_id, costume_id, storage, object_key, mime, bytes, sort)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, sort`,
      [photoId, req.tenantId, req.params.id, stored.storage, stored.key, mime, buf.length, sort]
    );
    await logAudit(req, 'costume.photo', 'costume', req.params.id, { photo_id: photoId });
    res.json({ ok: true, photo: { id: row.id, url: photoPublicUrl(row.id, stored.key), sort: row.sort } });
  }
);

router.delete('/:id/photos/:pid', requireRole('owner', 'manager'), async (req, res) => {
  const row = await queryOne(
    `DELETE FROM costume_photos WHERE id = $1 AND costume_id = $2 AND tenant_id = $3
     RETURNING object_key, storage`,
    [req.params.pid, req.params.id, req.tenantId]
  );
  if (!row) return res.status(404).json({ ok: false, error: 'not found' });
  await deleteObject(row.object_key, row.storage);
  res.json({ ok: true });
});

export default router;
