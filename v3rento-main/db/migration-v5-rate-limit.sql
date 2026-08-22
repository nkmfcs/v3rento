-- ============================================================================
-- Миграция v5: постоянный (в БД) счётчик rate-limit.
-- In-memory лимитер обнулялся при каждом рестарте контейнера (деплой) и не
-- работал на нескольких инстансах — атакующий мог перебирать пароли заново
-- после деплоя. Теперь счётчик общий и переживает рестарты.
-- Идемпотентна.
-- ============================================================================

CREATE TABLE IF NOT EXISTS rate_limits (
  key       TEXT PRIMARY KEY,            -- prefix:ip:login
  count     INT NOT NULL DEFAULT 0,
  reset_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limits_reset_idx ON rate_limits (reset_at);
