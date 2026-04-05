-- ============================================================
-- SMART WORLD SRLS — Business Intelligence Database Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Monthly financial summary (from budget file)
CREATE TABLE monthly_summary (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  period TEXT NOT NULL UNIQUE, -- '2026-01'
  year INT NOT NULL,
  month INT NOT NULL,
  total_revenue NUMERIC(12,2) DEFAULT 0,
  total_expenses NUMERIC(12,2) DEFAULT 0,
  net_profit NUMERIC(12,2) DEFAULT 0,
  profit_after_inventory NUMERIC(12,2) DEFAULT 0,
  iva_pos NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Revenue breakdown by source
CREATE TABLE revenue_lines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  period TEXT NOT NULL REFERENCES monthly_summary(period) ON DELETE CASCADE,
  source TEXT NOT NULL, -- 'wu', 'ria', 'mg', 'prodotti', 'ticket', 'riparazioni', 'luggage_app', 'luggage_locale', 'ricarica_sim', 'dif_iva'
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(period, source)
);

-- 3. Expense breakdown
CREATE TABLE expense_lines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  period TEXT NOT NULL REFERENCES monthly_summary(period) ON DELETE CASCADE,
  category TEXT NOT NULL, -- 'affitto', 'stipendi', 'taxes', 'abbonamenti', 'internet', 'spese_locale', 'bank_expenses', 'commercialista', etc.
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(period, category)
);

-- 4. Sales by category (from Erply POS export)
CREATE TABLE sales_by_category (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  period TEXT NOT NULL,
  category_name TEXT NOT NULL,
  sold_quantity INT DEFAULT 0,
  net_sales NUMERIC(12,2) DEFAULT 0,
  vat_amount NUMERIC(12,2) DEFAULT 0,
  sales_with_vat NUMERIC(12,2) DEFAULT 0,
  net_discount NUMERIC(12,2) DEFAULT 0,
  discount_pct NUMERIC(5,2) DEFAULT 0,
  purchase_value NUMERIC(12,2) DEFAULT 0,    -- from detailed report
  sales_profit NUMERIC(12,2) DEFAULT 0,      -- from detailed report
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(period, category_name)
);

-- 5. Bank transactions (from Lista Movimenti)
CREATE TABLE bank_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  period TEXT NOT NULL,
  transaction_date DATE NOT NULL,
  value_date DATE,
  amount NUMERIC(12,2) NOT NULL,
  description TEXT NOT NULL,
  category TEXT, -- 'pos_income', 'pos_expense', 'bonifico_in', 'bonifico_out', 'sdd', 'commission', 'cash_deposit', 'other'
  subcategory TEXT, -- 'salary', 'supplier', 'rent', 'amazon', 'travel', 'subscription', etc.
  counterpart TEXT, -- merchant/beneficiary name
  running_balance NUMERIC(12,2),
  raw_description TEXT, -- original full description
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_bank_tx_period ON bank_transactions(period);
CREATE INDEX idx_bank_tx_date ON bank_transactions(transaction_date);
CREATE INDEX idx_bank_tx_category ON bank_transactions(category);

-- 6. Credit card transactions (Amex)
CREATE TABLE amex_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  period TEXT NOT NULL, -- statement period
  operation_date DATE NOT NULL,
  booking_date DATE,
  description TEXT NOT NULL,
  amount_eur NUMERIC(12,2) NOT NULL,
  amount_foreign NUMERIC(12,2),
  currency_foreign TEXT,
  exchange_rate NUMERIC(10,4),
  category TEXT, -- 'subscription', 'travel', 'supply', 'baluwo', 'tax', etc.
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_amex_period ON amex_transactions(period);

-- 7. Payroll / Cedolini
CREATE TABLE payroll (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  period TEXT NOT NULL,
  employee_code INT,
  employee_name TEXT NOT NULL,
  role TEXT,
  part_time_pct NUMERIC(5,2) DEFAULT 100,
  hire_date DATE,
  hours_worked NUMERIC(6,2),
  days_worked INT,
  gross_pay NUMERIC(10,2) NOT NULL,
  social_contributions NUMERIC(10,2) DEFAULT 0,
  irpef NUMERIC(10,2) DEFAULT 0,
  net_pay NUMERIC(10,2) NOT NULL,
  tfr_month NUMERIC(10,2) DEFAULT 0,
  additional_regional NUMERIC(10,2) DEFAULT 0,
  additional_municipal NUMERIC(10,2) DEFAULT 0,
  total_deductions NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(period, employee_name)
);

-- 8. File upload tracking
CREATE TABLE file_uploads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL, -- 'sales_by_category', 'bank_movements', 'amex_statement', 'payroll', 'budget', 'invoices'
  period TEXT,
  storage_path TEXT NOT NULL,
  status TEXT DEFAULT 'uploaded', -- 'uploaded', 'parsing', 'parsed', 'error'
  error_message TEXT,
  rows_imported INT DEFAULT 0,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  parsed_at TIMESTAMPTZ
);

-- 9. Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_monthly_summary_updated
  BEFORE UPDATE ON monthly_summary
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 10. Supabase Storage bucket
-- Run in Supabase dashboard > Storage > Create bucket: "documents"
-- Set policy: authenticated users can upload, service role can read

-- 11. RLS Policies (basic - adjust for your auth setup)
ALTER TABLE monthly_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_by_category ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE amex_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_uploads ENABLE ROW LEVEL SECURITY;

-- Allow all for service role (API routes use service key)
CREATE POLICY "Service role full access" ON monthly_summary FOR ALL USING (true);
CREATE POLICY "Service role full access" ON revenue_lines FOR ALL USING (true);
CREATE POLICY "Service role full access" ON expense_lines FOR ALL USING (true);
CREATE POLICY "Service role full access" ON sales_by_category FOR ALL USING (true);
CREATE POLICY "Service role full access" ON bank_transactions FOR ALL USING (true);
CREATE POLICY "Service role full access" ON amex_transactions FOR ALL USING (true);
CREATE POLICY "Service role full access" ON payroll FOR ALL USING (true);
CREATE POLICY "Service role full access" ON file_uploads FOR ALL USING (true);
