-- ============================================================================
-- v6 — приём оплаты заказов (полная и частичная) + связь с финансами.
-- Добавляет orders.paid_amount: сколько по заказу уже оплачено.
-- Бэкфилл: ранее оплаченные заказы (paid=TRUE) считаем полностью оплаченными.
-- ============================================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

UPDATE orders SET paid_amount = total WHERE paid = TRUE AND paid_amount = 0;
