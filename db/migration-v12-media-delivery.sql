-- Фото костюмов + поля доставки без API-токена (номер из приложения Яндекс Go).

CREATE TABLE IF NOT EXISTS costume_photos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  costume_id  UUID NOT NULL REFERENCES costumes(id) ON DELETE CASCADE,
  storage     TEXT NOT NULL DEFAULT 'local',   -- local | s3
  object_key  TEXT NOT NULL,
  mime        TEXT NOT NULL DEFAULT 'image/jpeg',
  bytes       INT NOT NULL DEFAULT 0,
  sort        INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS costume_photos_costume_idx ON costume_photos (tenant_id, costume_id, sort, created_at);

ALTER TABLE costume_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE costume_photos FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON costume_photos;
CREATE POLICY tenant_isolation ON costume_photos
  USING (app_bypass_rls() OR tenant_id = app_current_tenant())
  WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant());

GRANT SELECT, INSERT, UPDATE, DELETE ON costume_photos TO app_rls;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS yandex_ref    TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS yandex_status TEXT NOT NULL DEFAULT 'none';
