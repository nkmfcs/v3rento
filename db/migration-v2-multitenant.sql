-- ============================================================================
-- Миграция v2: Multi-tenant архитектура
-- Запускать ОДИН РАЗ на живой базе.
-- Существующие данные переедут в тенант с id DEFAULT_TENANT_ID.
-- ============================================================================

BEGIN;

-- 1. Расширение для генерации случайных байт (уже есть pgcrypto, добавляем на всякий)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- TENANTS — каждый прокат = один тенант
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       TEXT UNIQUE NOT NULL,          -- URL-safe: "karnaval", "maskarad"
  name       TEXT NOT NULL DEFAULT 'Прокат',
  plan       TEXT NOT NULL DEFAULT 'free',  -- 'free' | 'pro'
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Дефолтный тенант для существующих данных
INSERT INTO tenants (id, slug, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'rento', 'RENTO')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- INVITES — приглашения работников (создаёт владелец)
-- ============================================================================
CREATE TABLE IF NOT EXISTS invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  token       TEXT UNIQUE NOT NULL,
  role        TEXT NOT NULL DEFAULT 'employee',  -- employee | manager
  name_hint   TEXT,                               -- подсказка для формы регистрации
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  used_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS invites_token_idx ON invites (token);
CREATE INDEX IF NOT EXISTS invites_tenant_id_idx ON invites (tenant_id);

-- ============================================================================
-- Добавляем tenant_id к существующим таблицам
-- ============================================================================

-- USERS
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE users SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
CREATE INDEX IF NOT EXISTS users_tenant_id_idx ON users (tenant_id);

-- COSTUMES
ALTER TABLE costumes ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE costumes SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE costumes ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS costumes_tenant_id_idx ON costumes (tenant_id);

-- CLIENTS
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE clients SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE clients ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS clients_tenant_id_idx ON clients (tenant_id);

-- ORDERS
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE orders SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE orders ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS orders_tenant_id_idx ON orders (tenant_id);

-- TRANSACTIONS
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE transactions SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE transactions ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS transactions_tenant_id_idx ON transactions (tenant_id);

-- NOTIFICATIONS
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE notifications SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
CREATE INDEX IF NOT EXISTS notifications_tenant_id_idx ON notifications (tenant_id);

-- ============================================================================
-- SETTINGS — из одной строки (id=1) в per-tenant
-- ============================================================================
ALTER TABLE settings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) UNIQUE;
UPDATE settings SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE id = 1 AND tenant_id IS NULL;

COMMIT;
