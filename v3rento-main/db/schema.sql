-- ============================================================================
-- Костюмерная «Карнавал» — схема БД под текущий дизайн.
-- Одинокий прокат (без multi-tenant). Костюмы как flat-сущность.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- USERS — владельцы / сотрудники единственного проката
-- ============================================================================
CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  login        TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,                     -- bcrypt
  name         TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'owner',      -- owner | manager | employee
  email        TEXT,
  phone        TEXT,
  telegram     TEXT,                                -- @username
  avatar_text  TEXT,                                -- "МК" — для аватарки
  gradient     TEXT,                                -- "#CFEAD7,#5EB286" — для аватарки
  birthday     TEXT,                                -- "14 марта"
  address      TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  session_epoch INT NOT NULL DEFAULT 0,              -- бамп инвалидирует все выданные JWT
  last_login_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- COSTUMES — flat склад
-- ============================================================================
CREATE TABLE costumes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type         TEXT UNIQUE NOT NULL,           -- 'spider', 'bat' — для SVG art-генератора
  name         TEXT NOT NULL,                  -- "Человек-паук"
  sizes        TEXT,                            -- "104, 110, 116"
  total        INT NOT NULL DEFAULT 1,         -- всего единиц
  available    INT NOT NULL DEFAULT 1,         -- свободно сейчас (вычисляется при изменениях)
  price_per_day NUMERIC(12,2) NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'avail',  -- avail | out | rep
  category     TEXT,                            -- "Супергерои"
  note         TEXT,
  rent_days_default INT NOT NULL DEFAULT 3,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT costumes_counts_ok CHECK (total >= 0 AND available >= 0 AND available <= total)
);
CREATE INDEX costumes_status_idx ON costumes (status);

-- ============================================================================
-- CLIENTS
-- ============================================================================
CREATE TABLE clients (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type         TEXT NOT NULL DEFAULT 'person',  -- person | org
  name         TEXT NOT NULL,
  phone        TEXT,
  email        TEXT,
  telegram     TEXT,
  address      TEXT,
  note         TEXT,
  avatar_text  TEXT,                             -- "ШМ"
  gradient     TEXT,                             -- "#DDB261,#C2891F"
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,     -- soft-delete: сохраняет связь с заказами
  -- Кэш статистики (обновляется триггером после операций над orders)
  total_orders INT NOT NULL DEFAULT 0,
  total_spent  NUMERIC(14,2) NOT NULL DEFAULT 0,
  debt         NUMERIC(14,2) NOT NULL DEFAULT 0,
  last_order_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX clients_type_idx ON clients (type);
CREATE INDEX clients_name_idx ON clients (lower(name));

-- ============================================================================
-- ORDERS
-- ============================================================================
CREATE TABLE orders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Видимый номер заказа: 1042, 1045 ...
  number       INT UNIQUE NOT NULL,
  client_id    UUID REFERENCES clients(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'req',
  -- req | book | conf | build | out | over | closed | cancelled

  issue_date   DATE NOT NULL,
  return_date  DATE NOT NULL,
  days         INT NOT NULL DEFAULT 1,

  delivery_type TEXT NOT NULL DEFAULT 'pickup', -- pickup | yandex | courier
  delivery_addr TEXT,
  delivery_cost NUMERIC(12,2) NOT NULL DEFAULT 0,

  subtotal     NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_label TEXT,                            -- "Скидка постоянному −10%"
  total        NUMERIC(12,2) NOT NULL DEFAULT 0,

  deposit      NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid         BOOLEAN NOT NULL DEFAULT FALSE,
  payment_method TEXT,                            -- 'Карта' | 'Наличные' | 'Перевод'

  note         TEXT,
  source       TEXT NOT NULL DEFAULT 'manual',   -- manual | telegram | call

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX orders_status_idx ON orders (status);
CREATE INDEX orders_issue_date_idx ON orders (issue_date);
CREATE INDEX orders_return_date_idx ON orders (return_date);
CREATE INDEX orders_client_id_idx ON orders (client_id);

-- ============================================================================
-- ORDER_ITEMS — позиции в заказе
-- ============================================================================
CREATE TABLE order_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  costume_id   UUID NOT NULL REFERENCES costumes(id) ON DELETE RESTRICT,
  -- Снэпшот данных костюма на момент заказа — чтобы исторические заказы не ломались
  -- при изменении / удалении костюма
  costume_type TEXT NOT NULL,                     -- 'spider', 'bat'
  name         TEXT NOT NULL,
  description  TEXT,
  price_per_day NUMERIC(12,2) NOT NULL DEFAULT 0,
  qty          INT NOT NULL DEFAULT 1,
  CONSTRAINT order_items_qty_positive CHECK (qty > 0)
);
CREATE INDEX order_items_order_id_idx ON order_items (order_id);
CREATE INDEX order_items_costume_id_idx ON order_items (costume_id);

-- ============================================================================
-- ORDER_HISTORY — log событий заказа (для timeline)
-- ============================================================================
CREATE TABLE order_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event        TEXT NOT NULL,                     -- 'created' | 'status_changed' | 'paid' | 'note'
  detail       TEXT,                              -- свободный текст для UI
  meta         JSONB DEFAULT '{}'::jsonb,
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX order_history_order_id_idx ON order_history (order_id, created_at);

-- ============================================================================
-- ORDER_CHECKLIST — чек-лист сборки
-- ============================================================================
CREATE TABLE order_checklist (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  text         TEXT NOT NULL,
  done         BOOLEAN NOT NULL DEFAULT FALSE,
  done_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  done_at      TIMESTAMPTZ,
  sort_order   INT NOT NULL DEFAULT 0
);
CREATE INDEX order_checklist_order_id_idx ON order_checklist (order_id);

-- ============================================================================
-- TRANSACTIONS — финансы
-- ============================================================================
CREATE TABLE transactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type         TEXT NOT NULL,                      -- 'income' | 'expense'
  amount       NUMERIC(14,2) NOT NULL,
  category     TEXT NOT NULL,                      -- "Прокат" | "Зарплата" | "Аренда" ...
  description  TEXT,
  date         DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT,
  order_id     UUID REFERENCES orders(id) ON DELETE SET NULL,
  client_id    UUID REFERENCES clients(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX transactions_date_idx ON transactions (date);
CREATE INDEX transactions_type_idx ON transactions (type);

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================
CREATE TABLE notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,                      -- 'order_request' | 'overdue' | 'payment' | 'system'
  icon         TEXT,                                -- emoji
  title        TEXT NOT NULL,
  subtitle     TEXT,
  link_to      TEXT,                                -- '/orders/1042' — для перехода в UI
  read         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX notifications_user_unread_idx ON notifications (user_id, read);

-- ============================================================================
-- SETTINGS — одна строка с параметрами проката
-- ============================================================================
CREATE TABLE settings (
  id           INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  shop_name    TEXT NOT NULL DEFAULT 'Прокат «Карнавал»',
  address      TEXT,
  phone        TEXT,
  currency     TEXT NOT NULL DEFAULT 'UZS',
  work_hours   TEXT,
  min_rent_days INT NOT NULL DEFAULT 1,
  deposit_pct  INT NOT NULL DEFAULT 50,           -- 50% от стоимости
  fine_pct_per_day INT NOT NULL DEFAULT 20,       -- штраф просрочки
  org_discount_pct INT NOT NULL DEFAULT 10,       -- скидка организациям
  notif_new_order   BOOLEAN NOT NULL DEFAULT TRUE,
  notif_overdue     BOOLEAN NOT NULL DEFAULT TRUE,
  notif_telegram    BOOLEAN NOT NULL DEFAULT TRUE,
  notif_daily_report BOOLEAN NOT NULL DEFAULT FALSE,
  telegram_bot_handle TEXT,                       -- "@karnaval_uz_bot"
  telegram_bot_connected BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- TRIGGERS — поддерживаем denormalized поля клиентов
-- ============================================================================

-- Обновление updated_at на orders
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_touch_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION touch_updated_at();
