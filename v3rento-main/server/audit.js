/* Аудит-лог — единая точка записи событий.
 *
 * ПРИНЦИП: best-effort. Ошибка записи в журнал НЕ должна ронять основной запрос —
 * всё обёрнуто в try/catch. Скоуп тенанта берём из req (req.tenantId / сессия),
 * с возможностью явного override (нужно для login — там контекст тенанта ещё не
 * выставлен middleware'ами). Запись идёт через query(): внутри запроса это
 * закреплённое соединение под app_rls (RLS проверит tenant_id), в auth-роутах до
 * тенант-контекста — общий пул под neondb_owner (bypass) с явным tenant_id.
 */
import { query } from './db.js';

/**
 * @param {object} req            Express req (для tenant/user/ip); может быть null.
 * @param {string} action         'order.create' | 'payment' | 'settings.update' ...
 * @param {string} [entity]       'order' | 'costume' | 'client' | 'settings' | 'user' | 'team'
 * @param {string|number} [entityId]
 * @param {object} [meta]         произвольные детали
 * @param {object} [override]     { tenantId, userId } — если недоступны в req (login)
 */
export async function logAudit(req, action, entity = null, entityId = null, meta = null, override = {}) {
  try {
    const tenantId = override.tenantId ?? req?.tenantId ?? req?.session?.tenantId ?? null;
    const userId = override.userId ?? req?.session?.userId ?? null;
    const ip = (req && (req.ip || req.headers?.['x-forwarded-for'])) || null;
    await query(
      `INSERT INTO audit_log (tenant_id, user_id, action, entity, entity_id, meta, ip)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`,
      [
        tenantId,
        userId,
        action,
        entity,
        entityId != null ? String(entityId) : null,
        meta ? JSON.stringify(meta) : null,
        ip ? String(ip).slice(0, 64) : null,
      ]
    );
  } catch (e) {
    // Журнал — не критичный путь: логируем в консоль сервера и продолжаем.
    console.error('[audit] failed:', e.message);
  }
}
