-- ============================================================================
-- Миграция v3: правки уникальности под multi-tenant.
-- Запускать ПОСЛЕ migration-v2-multitenant.sql. Идемпотентна.
-- База v2 переносила данные, но оставляла три constraint'а глобальными —
-- из-за чего второй прокат не мог: создать настройки (C3), заказ (C2),
-- костюм с уже занятым type (этот файл). Всё это чиним здесь.
-- ============================================================================

BEGIN;

-- C2: номер заказа уникален В ПРЕДЕЛАХ проката, а не глобально.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_number_key;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_tenant_number_uniq;
ALTER TABLE orders ADD CONSTRAINT orders_tenant_number_uniq UNIQUE (tenant_id, number);

-- costumes.type уникален в пределах проката (раньше — глобально).
ALTER TABLE costumes DROP CONSTRAINT IF EXISTS costumes_type_key;
ALTER TABLE costumes DROP CONSTRAINT IF EXISTS costumes_tenant_type_uniq;
ALTER TABLE costumes ADD CONSTRAINT costumes_tenant_type_uniq UNIQUE (tenant_id, type);

-- C3: settings из «одной строки id=1» в «строка на тенант».
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_id_check;
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_pkey;
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_tenant_id_key;
UPDATE settings SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE settings ALTER COLUMN tenant_id SET NOT NULL;
-- PK на tenant_id (добавляем только если его ещё нет)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'settings'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE settings ADD PRIMARY KEY (tenant_id);
  END IF;
END $$;
ALTER TABLE settings DROP COLUMN IF EXISTS id;

COMMIT;
