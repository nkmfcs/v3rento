-- v17: CHECK-ограничения на статусные поля (защита от прямых изменений БД)
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('req','book','conf','build','out','over','closed','cancelled'));

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_delivery_type_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_delivery_type_check
  CHECK (delivery_type IN ('pickup','addr','yandex','courier'));

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_slot_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_slot_check
  CHECK (slot IN ('am','pm'));

ALTER TABLE costumes DROP CONSTRAINT IF EXISTS costumes_status_check;
ALTER TABLE costumes
  ADD CONSTRAINT costumes_status_check
  CHECK (status IN ('avail','out','rep'));
