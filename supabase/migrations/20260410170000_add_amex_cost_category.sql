-- Add cost_category column to amex_transactions (same as bank_transactions)
ALTER TABLE amex_transactions ADD COLUMN IF NOT EXISTS cost_category TEXT DEFAULT '';
