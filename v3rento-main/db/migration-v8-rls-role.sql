-- ============================================================================
-- v8 — роль без обхода RLS.
--
-- Дефолтная роль Neon (neondb_owner) имеет атрибут BYPASSRLS → политики её не
-- касаются, и снять атрибут нельзя (нужен superuser). Решение: отдельная роль
-- app_rls БЕЗ bypass, в которую сервер входит через SET ROLE на каждый запрос
-- (server/db.js). Тогда RLS реально применяется. Строку подключения и роль
-- Railway менять НЕ нужно — коннектимся так же, только переключаем роль внутри.
-- Миграции/скрипты остаются под neondb_owner (bypass) — им нужен полный доступ.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
    CREATE ROLE app_rls NOLOGIN NOBYPASSRLS;
  END IF;
END $$;

-- neondb_owner должен уметь переключаться в app_rls (SET ROLE)
GRANT app_rls TO neondb_owner;

-- Права app_rls на данные (строки всё равно фильтрует RLS)
GRANT USAGE ON SCHEMA public TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rls;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO app_rls;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_rls;

-- Для будущих таблиц/последовательностей (следующие миграции создаёт neondb_owner)
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rls;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_rls;
