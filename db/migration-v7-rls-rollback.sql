-- Откат v7: снять RLS со всех таблиц (аварийный, если что-то сломалось).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['costumes','clients','orders','transactions','notifications','settings','order_items','order_history','order_checklist']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
