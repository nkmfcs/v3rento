-- v16: составные индексы для multi-tenant запросов
-- Все основные запросы фильтруют по tenant_id + status/даты.
CREATE INDEX IF NOT EXISTS orders_tenant_status_idx
  ON orders (tenant_id, status);
CREATE INDEX IF NOT EXISTS orders_tenant_dates_idx
  ON orders (tenant_id, issue_date, return_date);
CREATE INDEX IF NOT EXISTS costumes_tenant_active_idx
  ON costumes (tenant_id, is_active);
CREATE INDEX IF NOT EXISTS clients_tenant_active_idx
  ON clients (tenant_id, is_active);
CREATE INDEX IF NOT EXISTS transactions_tenant_date_idx
  ON transactions (tenant_id, date DESC);
