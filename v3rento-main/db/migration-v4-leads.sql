-- ============================================================================
-- Миграция v4: заявки с лендинга (лиды).
-- Идемпотентна. Таблица ГЛОБАЛЬНАЯ — это проспекты, НЕ привязаны ни к какому
-- тенанту и не пересекаются с данными прокатов.
-- ============================================================================

CREATE TABLE IF NOT EXISTS leads (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  business   TEXT,                                   -- название бизнеса/города
  comment    TEXT,
  source     TEXT NOT NULL DEFAULT 'login_page',     -- откуда пришла заявка
  handled    BOOLEAN NOT NULL DEFAULT FALSE,         -- обработана владельцем
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS leads_created_at_idx ON leads (created_at DESC);
