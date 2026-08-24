-- ============================================================================
-- v9 — роль «сборщица» (employee): назначение заказа + чек-ин сборки.
-- Всё additive и идемпотентно (IF NOT EXISTS). Права/RBAC не трогаем (это C3).
--
-- orders.assigned_to  — ответственная за сборку (employee/manager этого тенанта).
-- orders.is_assembled — заказ собран (все позиции чек-листа отмечены, нажато «Собрано»).
--                       Работа сборщицы заканчивается здесь; выдачу (out) делает не она.
-- costumes.location   — где физически лежит костюм («полка A3»), для склада read-only.
--
-- Поля «кто/когда собрал позицию» уже есть в order_checklist (done_by/done_at) —
-- их и переиспользуем как packed_by/packed_at, отдельные колонки не заводим.
-- ============================================================================

ALTER TABLE orders   ADD COLUMN IF NOT EXISTS assigned_to  UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE orders   ADD COLUMN IF NOT EXISTS is_assembled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE costumes ADD COLUMN IF NOT EXISTS location     TEXT;

CREATE INDEX IF NOT EXISTS orders_assigned_to_idx ON orders (assigned_to);
