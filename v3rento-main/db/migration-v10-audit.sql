-- ============================================================================
-- v10 — аудит-лог: кто/что/когда сделал (безопасность, разбор инцидентов).
-- Пишется best-effort (ошибка лога не роняет основной запрос — см. server/audit.js).
-- Скоуп тенанта — и на уровне колонки, и через RLS (как остальные тенант-таблицы).
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,               -- 'order.create' | 'payment' | 'settings.update' ...
  entity     TEXT,                         -- 'order' | 'costume' | 'client' | 'settings' | 'user'
  entity_id  TEXT,                         -- id/номер сущности (строкой — гибко)
  meta       JSONB,                        -- произвольные детали события
  ip         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_log_tenant_created_idx ON audit_log (tenant_id, created_at DESC);

-- RLS — как у прочих тенант-таблиц (fail-closed при отсутствии контекста).
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON audit_log;
CREATE POLICY tenant_isolation ON audit_log
  USING (app_bypass_rls() OR tenant_id = app_current_tenant())
  WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant());

-- Явные гранты роли приложения (default privileges тоже покрывают, но так надёжнее).
GRANT SELECT, INSERT ON audit_log TO app_rls;
