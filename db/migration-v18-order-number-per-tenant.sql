-- v18: номер заказа уникален внутри тенанта, не глобально
-- Шаг 1: убрать глобальный уникальный индекс
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_number_key;
-- Шаг 2: добавить per-tenant уникальность (v3 мог уже поставить orders_tenant_number_uniq)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'orders'::regclass
      AND contype = 'u'
      AND conname IN ('orders_tenant_number_uniq', 'orders_number_tenant_unique')
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_number_tenant_unique UNIQUE (tenant_id, number);
  END IF;
END $$;
