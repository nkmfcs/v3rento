-- Ящики в комнатах: пуговицы, замки, материалы, шляпы + свои названия.

CREATE TABLE IF NOT EXISTS room_bins (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  room_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  sort       INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS room_bins_room_idx ON room_bins (tenant_id, room_id, sort);

ALTER TABLE room_bins ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_bins FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON room_bins;
CREATE POLICY tenant_isolation ON room_bins
  USING (app_bypass_rls() OR tenant_id = app_current_tenant())
  WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant());

GRANT SELECT, INSERT, UPDATE, DELETE ON room_bins TO app_rls;

INSERT INTO room_bins (tenant_id, room_id, name, sort)
SELECT t.id, r.room_id, b.name, b.sort
  FROM tenants t
  CROSS JOIN (VALUES ('1'), ('2'), ('3')) AS r(room_id)
  CROSS JOIN (VALUES
    ('Пуговицы', 0),
    ('Замки', 1),
    ('Материалы', 2),
    ('Шляпы', 3)
  ) AS b(name, sort)
 WHERE NOT EXISTS (SELECT 1 FROM room_bins x WHERE x.tenant_id = t.id);
