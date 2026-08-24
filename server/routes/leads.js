/* Заявки с лендинга (лиды). POST — публичный; GET — только владелец.
 * Лиды ГЛОБАЛЬНЫ и не связаны ни с одним тенантом — пересечься с данными
 * прокатов физически нечему. */
import { Router } from 'express';
import { query, queryOne } from '../db.js';
import { requireAuth, requirePlatformAdmin, dbRateLimit } from '../auth.js';

const router = Router();

// Не более 8 заявок в час с одного IP — защита от спама (DB-backed, переживает рестарты).
const leadLimiter = dbRateLimit({ windowMs: 60 * 60_000, max: 8, prefix: 'lead' });

const digits = (s) => String(s || '').replace(/\D/g, '');

// ===== Приём заявки (публично) =============================================
router.post('/', leadLimiter, async (req, res) => {
  const { name, phone, business, comment } = req.body ?? {};
  if (typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ ok: false, error: 'Укажите имя' });
  }
  if (typeof phone !== 'string' || digits(phone).length < 7) {
    return res.status(400).json({ ok: false, error: 'Укажите корректный телефон' });
  }

  const lead = await queryOne(
    `INSERT INTO leads (name, phone, business, comment, source)
     VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at`,
    [
      name.trim().slice(0, 80),
      phone.trim().slice(0, 40),
      (business || '').trim().slice(0, 120) || null,
      (comment || '').trim().slice(0, 500) || null,
      'login_page',
    ]
  );

  // Telegram-уведомление — не блокирует ответ, ошибки не роняют заявку.
  notifyTelegram({ name, phone, business, comment }).catch((e) =>
    console.error('[leads] telegram notify failed:', e.message)
  );

  res.json({ ok: true, id: lead.id });
});

// ===== Список заявок (только владелец) =====================================
router.get('/', requireAuth, requirePlatformAdmin, async (_req, res) => {
  const rows = await query(
    `SELECT id, name, phone, business, comment, source, handled, created_at
     FROM leads ORDER BY created_at DESC LIMIT 200`
  );
  res.json({ ok: true, items: rows });
});

router.patch('/:id/handled', requireAuth, requirePlatformAdmin, async (req, res) => {
  const r = await queryOne(
    `UPDATE leads SET handled = COALESCE($2, TRUE) WHERE id = $1 RETURNING id, handled`,
    [req.params.id, req.body?.handled ?? true]
  );
  if (!r) return res.status(404).json({ ok: false, error: 'not found' });
  res.json({ ok: true, lead: r });
});

// ===== Helper: отправка в Telegram =========================================
async function notifyTelegram({ name, phone, business, comment }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_LEAD_CHAT_ID;
  if (!token || !chatId) return; // не настроено — заявка уже сохранена в БД

  const esc = (s) => String(s).replace(/[<&>]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  const lines = [
    '🆕 <b>Новая заявка — Rento</b>',
    '',
    `👤 <b>${esc(name)}</b>`,
    `📞 ${esc(phone)}`,
    business ? `🏪 ${esc(business)}` : null,
    comment ? `💬 ${esc(comment)}` : null,
  ].filter(Boolean);

  const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: lines.join('\n'), parse_mode: 'HTML' }),
  });
  if (!resp.ok) throw new Error(`telegram HTTP ${resp.status}`);
}

export default router;
