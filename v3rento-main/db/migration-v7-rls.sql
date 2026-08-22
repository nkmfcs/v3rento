-- ============================================================================
-- v7 — Row-Level Security: изоляция тенантов на уровне БД.
--
-- Даже если в коде когда-нибудь забудут `WHERE tenant_id`, сама Postgres не
-- отдаст и не даст записать чужие строки. Политики читают app.tenant_id —
-- переменную сессии, которую сервер ставит на закреплённое соединение запроса
-- (server/db.js → withTenantContext). Нет контекста → NULL → 0 строк (fail-closed).
--
-- НЕ трогаем: users, tenants, invites, leads, rate_limits — они нужны ДО того,
-- как известен тенант (логин, регистрация, приём по приглашению).
--
-- ВАЖНО: эту миграцию применять ПОСЛЕ деплоя кода, который ставит контекст.
-- Откат — db/migration-v7-rls-rollback.sql.
-- ============================================================================

-- Текущий тенант запроса (или NULL, если контекст не задан).
CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
  LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

-- Флаг обхода RLS (только консоль платформенного оператора).
CREATE OR REPLACE FUNCTION app_bypass_rls() RETURNS boolean
  LANGUAGE sql STABLE AS $$
  SELECT current_setting('app.bypass_rls', true) = 'on'
$$;

-- ---- Таблицы с прямой колонкой tenant_id -----------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['costumes','clients','orders','transactions','notifications','settings']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);  -- владелец таблицы тоже под RLS
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (app_bypass_rls() OR tenant_id = app_current_tenant())
        WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant())
    $f$, t);
  END LOOP;
END $$;

-- ---- Дочерние таблицы заказа (нет своей tenant_id — видимость через orders) --
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['order_items','order_history','order_checklist']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    -- orders уже под RLS → подзапрос видит только заказы текущего тенанта.
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (app_bypass_rls() OR EXISTS (SELECT 1 FROM orders o WHERE o.id = %I.order_id))
        WITH CHECK (app_bypass_rls() OR EXISTS (SELECT 1 FROM orders o WHERE o.id = %I.order_id))
    $f$, t, t, t);
  END LOOP;
END $$;
