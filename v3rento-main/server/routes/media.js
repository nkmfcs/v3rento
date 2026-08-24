import { Router } from 'express';
import { queryOne } from '../db.js';
import { readObject } from '../s3.js';

const router = Router();

router.get('/:id', async (req, res) => {
  const p = await queryOne(
    `SELECT object_key, storage, mime FROM costume_photos WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, req.tenantId]
  );
  if (!p) return res.status(404).json({ ok: false, error: 'not found' });
  try {
    const buf = await readObject(p.object_key, p.storage);
    res.setHeader('Content-Type', p.mime || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(buf);
  } catch {
    res.status(404).json({ ok: false, error: 'file missing' });
  }
});

export default router;
