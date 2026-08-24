-- ============================================================================
-- v11 — ручная оценка сборки заказа (звёзды 1–5 + заметка) руководителем.
-- Авто-метрики (полнота/вовремя) считаются на лету и здесь НЕ хранятся.
--
-- Уникальность: ОДНА оценка на заказ — UNIQUE(order_id). Оценка характеризует
-- качество сборки конкретного заказа, а не мнение конкретного руководителя;
-- повторная простановка обновляет её (upsert), rated_by = кто оценил последним.
-- Средняя ⭐ сотрудницы = AVG(stars) по её заказам с оценкой.
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_ratings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES users(id) ON DELETE SET NULL,   -- кого оцениваем (assigned_to заказа)
  rated_by    UUID REFERENCES users(id) ON DELETE SET NULL,   -- кто поставил оценку
  stars       INT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_ratings_order_uniq UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS order_ratings_employee_idx ON order_ratings (tenant_id, employee_id);

-- RLS — как у прочих тенант-таблиц.
ALTER TABLE order_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_ratings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON order_ratings;
CREATE POLICY tenant_isolation ON order_ratings
  USING (app_bypass_rls() OR tenant_id = app_current_tenant())
  WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant());

GRANT SELECT, INSERT, UPDATE ON order_ratings TO app_rls;
