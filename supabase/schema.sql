-- ============================================================
-- CONTROLLO GESTIONE — Multi-Tenant Database Schema
-- Run this in Supabase SQL Editor (fresh project)
-- ============================================================

-- ══════════════════════════════════════════════════════════════
-- DROP existing tables (safe re-run)
-- ══════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS file_uploads CASCADE;
DROP TABLE IF EXISTS payroll CASCADE;
DROP TABLE IF EXISTS amex_transactions CASCADE;
DROP TABLE IF EXISTS bank_transactions CASCADE;
DROP TABLE IF EXISTS sales_by_category CASCADE;
DROP TABLE IF EXISTS expense_lines CASCADE;
DROP TABLE IF EXISTS revenue_lines CASCADE;
DROP TABLE IF EXISTS monthly_summary CASCADE;
DROP TABLE IF EXISTS import_batches CASCADE;
DROP TABLE IF EXISTS user_clients CASCADE;
DROP TABLE IF EXISTS clients CASCADE;
DROP FUNCTION IF EXISTS user_has_client_access(UUID) CASCADE;
DROP FUNCTION IF EXISTS update_updated_at() CASCADE;

-- ══════════════════════════════════════════════════════════════
-- 0. CLIENTS & USER MAPPING
-- ══════════════════════════════════════════════════════════════

CREATE TABLE clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  share_token TEXT UNIQUE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE user_clients (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'editor',
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, client_id)
);

-- ══════════════════════════════════════════════════════════════
-- 0b. IMPORT BATCHES (for undo / audit trail)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE import_batches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  file_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  period TEXT,
  rows_imported INT DEFAULT 0,
  imported_by UUID REFERENCES auth.users(id),
  imported_at TIMESTAMPTZ DEFAULT now(),
  undone_at TIMESTAMPTZ
);

-- ══════════════════════════════════════════════════════════════
-- 1. Monthly financial summary
-- ══════════════════════════════════════════════════════════════

CREATE TABLE monthly_summary (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  year INT NOT NULL,
  month INT NOT NULL,
  total_revenue NUMERIC(12,2) DEFAULT 0,
  total_expenses NUMERIC(12,2) DEFAULT 0,
  net_profit NUMERIC(12,2) DEFAULT 0,
  profit_after_inventory NUMERIC(12,2) DEFAULT 0,
  iva_pos NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, period)
);

-- ══════════════════════════════════════════════════════════════
-- 2. Revenue breakdown by source
-- ══════════════════════════════════════════════════════════════

CREATE TABLE revenue_lines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  source TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, period, source)
);

-- ══════════════════════════════════════════════════════════════
-- 3. Expense breakdown
-- ══════════════════════════════════════════════════════════════

CREATE TABLE expense_lines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  category TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, period, category)
);

-- ══════════════════════════════════════════════════════════════
-- 4. Sales by category (from POS export)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE sales_by_category (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  import_batch_id UUID REFERENCES import_batches(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  rank INT DEFAULT 0,
  category_name TEXT NOT NULL,
  sold_quantity INT DEFAULT 0,
  net_sales NUMERIC(12,2) DEFAULT 0,
  vat_amount NUMERIC(12,2) DEFAULT 0,
  sales_with_vat NUMERIC(12,2) DEFAULT 0,
  net_discount NUMERIC(12,2) DEFAULT 0,
  discount_pct NUMERIC(5,2) DEFAULT 0,
  purchase_value NUMERIC(12,2) DEFAULT 0,
  sales_profit NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sales_batch ON sales_by_category(import_batch_id);
CREATE INDEX idx_sales_client_period ON sales_by_category(client_id, period);

-- ══════════════════════════════════════════════════════════════
-- 5. Bank transactions
-- ══════════════════════════════════════════════════════════════

CREATE TABLE bank_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  transaction_date DATE NOT NULL,
  value_date DATE,
  amount NUMERIC(12,2) NOT NULL,
  description TEXT NOT NULL,
  category TEXT,
  subcategory TEXT,
  counterpart TEXT,
  running_balance NUMERIC(12,2),
  raw_description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_bank_tx_client_period ON bank_transactions(client_id, period);
CREATE INDEX idx_bank_tx_date ON bank_transactions(transaction_date);

-- ══════════════════════════════════════════════════════════════
-- 6. Credit card transactions (Amex)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE amex_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  operation_date DATE NOT NULL,
  booking_date DATE,
  description TEXT NOT NULL,
  amount_eur NUMERIC(12,2) NOT NULL,
  amount_foreign NUMERIC(12,2),
  currency_foreign TEXT,
  exchange_rate NUMERIC(10,4),
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_amex_client_period ON amex_transactions(client_id, period);

-- ══════════════════════════════════════════════════════════════
-- 7. Payroll / Cedolini
-- ══════════════════════════════════════════════════════════════

CREATE TABLE payroll (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
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
  UNIQUE(client_id, period, employee_name)
);

-- ══════════════════════════════════════════════════════════════
-- 8. File upload tracking
-- ══════════════════════════════════════════════════════════════

CREATE TABLE file_uploads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  period TEXT,
  storage_path TEXT NOT NULL,
  status TEXT DEFAULT 'uploaded',
  error_message TEXT,
  rows_imported INT DEFAULT 0,
  uploaded_by UUID REFERENCES auth.users(id),
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  parsed_at TIMESTAMPTZ
);

-- ══════════════════════════════════════════════════════════════
-- 9. TRIGGERS
-- ══════════════════════════════════════════════════════════════

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

-- ══════════════════════════════════════════════════════════════
-- 10. ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION user_has_client_access(cid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_clients WHERE user_id = auth.uid() AND client_id = cid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_by_category ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE amex_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own clients" ON clients
  FOR SELECT USING (id IN (SELECT client_id FROM user_clients WHERE user_id = auth.uid()));

CREATE POLICY "Users see own memberships" ON user_clients
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Client data access" ON monthly_summary FOR ALL USING (user_has_client_access(client_id));
CREATE POLICY "Client data access" ON import_batches FOR ALL USING (user_has_client_access(client_id));
CREATE POLICY "Client data access" ON revenue_lines FOR ALL USING (user_has_client_access(client_id));
CREATE POLICY "Client data access" ON expense_lines FOR ALL USING (user_has_client_access(client_id));
CREATE POLICY "Client data access" ON sales_by_category FOR ALL USING (user_has_client_access(client_id));
CREATE POLICY "Client data access" ON bank_transactions FOR ALL USING (user_has_client_access(client_id));
CREATE POLICY "Client data access" ON amex_transactions FOR ALL USING (user_has_client_access(client_id));
CREATE POLICY "Client data access" ON payroll FOR ALL USING (user_has_client_access(client_id));
CREATE POLICY "Client data access" ON file_uploads FOR ALL USING (user_has_client_access(client_id));

-- ══════════════════════════════════════════════════════════════
-- 11. SEED: first client
-- ══════════════════════════════════════════════════════════════

INSERT INTO clients (slug, name, description)
VALUES ('smart-world', 'Smart World SRLS', 'Money Transfer, vendita elettronica, biglietteria, luggage storage, riparazioni')
ON CONFLICT (slug) DO NOTHING;
