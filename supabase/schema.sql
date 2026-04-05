-- ============================================================-- ============================================================

-- CONTROLLO GESTIONE — Multi-Tenant Database Schema-- SMART WORLD SRLS — Business Intelligence Database Schema

-- Run this in Supabase SQL Editor (fresh project)-- Run this in Supabase SQL Editor

-- ============================================================-- ============================================================



-- ══════════════════════════════════════════════════════════════-- 1. Monthly financial summary (from budget file)

-- 0. CLIENTS & USER MAPPINGCREATE TABLE monthly_summary (

-- ══════════════════════════════════════════════════════════════  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  period TEXT NOT NULL UNIQUE, -- '2026-01'

CREATE TABLE clients (  year INT NOT NULL,

  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,  month INT NOT NULL,

  slug TEXT UNIQUE NOT NULL,           -- 'smart-world'  total_revenue NUMERIC(12,2) DEFAULT 0,

  name TEXT NOT NULL,                  -- 'Smart World SRLS'  total_expenses NUMERIC(12,2) DEFAULT 0,

  description TEXT,  net_profit NUMERIC(12,2) DEFAULT 0,

  logo_url TEXT,  profit_after_inventory NUMERIC(12,2) DEFAULT 0,

  is_active BOOLEAN DEFAULT true,  iva_pos NUMERIC(12,2) DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now()  notes TEXT,

);  created_at TIMESTAMPTZ DEFAULT now(),

  updated_at TIMESTAMPTZ DEFAULT now()

-- Maps Supabase Auth users → clients they can access);

CREATE TABLE user_clients (

  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,-- 2. Revenue breakdown by source

  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,CREATE TABLE revenue_lines (

  role TEXT NOT NULL DEFAULT 'editor',  -- 'admin', 'editor', 'viewer'  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  created_at TIMESTAMPTZ DEFAULT now(),  period TEXT NOT NULL REFERENCES monthly_summary(period) ON DELETE CASCADE,

  PRIMARY KEY (user_id, client_id)  source TEXT NOT NULL, -- 'wu', 'ria', 'mg', 'prodotti', 'ticket', 'riparazioni', 'luggage_app', 'luggage_locale', 'ricarica_sim', 'dif_iva'

);  amount NUMERIC(12,2) NOT NULL DEFAULT 0,

  notes TEXT,

-- ══════════════════════════════════════════════════════════════  created_at TIMESTAMPTZ DEFAULT now(),

-- 1. Monthly financial summary  UNIQUE(period, source)

-- ══════════════════════════════════════════════════════════════);



CREATE TABLE monthly_summary (-- 3. Expense breakdown

  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,CREATE TABLE expense_lines (

  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  period TEXT NOT NULL,  period TEXT NOT NULL REFERENCES monthly_summary(period) ON DELETE CASCADE,

  year INT NOT NULL,  category TEXT NOT NULL, -- 'affitto', 'stipendi', 'taxes', 'abbonamenti', 'internet', 'spese_locale', 'bank_expenses', 'commercialista', etc.

  month INT NOT NULL,  amount NUMERIC(12,2) NOT NULL DEFAULT 0,

  total_revenue NUMERIC(12,2) DEFAULT 0,  notes TEXT,

  total_expenses NUMERIC(12,2) DEFAULT 0,  created_at TIMESTAMPTZ DEFAULT now(),

  net_profit NUMERIC(12,2) DEFAULT 0,  UNIQUE(period, category)

  profit_after_inventory NUMERIC(12,2) DEFAULT 0,);

  iva_pos NUMERIC(12,2) DEFAULT 0,

  notes TEXT,-- 4. Sales by category (from Erply POS export)

  created_at TIMESTAMPTZ DEFAULT now(),CREATE TABLE sales_by_category (

  updated_at TIMESTAMPTZ DEFAULT now(),  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  UNIQUE(client_id, period)  period TEXT NOT NULL,

);  category_name TEXT NOT NULL,

  sold_quantity INT DEFAULT 0,

-- 2. Revenue breakdown by source  net_sales NUMERIC(12,2) DEFAULT 0,

CREATE TABLE revenue_lines (  vat_amount NUMERIC(12,2) DEFAULT 0,

  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,  sales_with_vat NUMERIC(12,2) DEFAULT 0,

  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,  net_discount NUMERIC(12,2) DEFAULT 0,

  period TEXT NOT NULL,  discount_pct NUMERIC(5,2) DEFAULT 0,

  source TEXT NOT NULL,  purchase_value NUMERIC(12,2) DEFAULT 0,    -- from detailed report

  amount NUMERIC(12,2) NOT NULL DEFAULT 0,  sales_profit NUMERIC(12,2) DEFAULT 0,      -- from detailed report

  notes TEXT,  created_at TIMESTAMPTZ DEFAULT now(),

  created_at TIMESTAMPTZ DEFAULT now(),  UNIQUE(period, category_name)

  UNIQUE(client_id, period, source));

);

-- 5. Bank transactions (from Lista Movimenti)

-- 3. Expense breakdownCREATE TABLE bank_transactions (

CREATE TABLE expense_lines (  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,  period TEXT NOT NULL,

  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,  transaction_date DATE NOT NULL,

  period TEXT NOT NULL,  value_date DATE,

  category TEXT NOT NULL,  amount NUMERIC(12,2) NOT NULL,

  amount NUMERIC(12,2) NOT NULL DEFAULT 0,  description TEXT NOT NULL,

  notes TEXT,  category TEXT, -- 'pos_income', 'pos_expense', 'bonifico_in', 'bonifico_out', 'sdd', 'commission', 'cash_deposit', 'other'

  created_at TIMESTAMPTZ DEFAULT now(),  subcategory TEXT, -- 'salary', 'supplier', 'rent', 'amazon', 'travel', 'subscription', etc.

  UNIQUE(client_id, period, category)  counterpart TEXT, -- merchant/beneficiary name

);  running_balance NUMERIC(12,2),

  raw_description TEXT, -- original full description

-- 4. Sales by category (from POS export)  created_at TIMESTAMPTZ DEFAULT now()

CREATE TABLE sales_by_category ();

  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,CREATE INDEX idx_bank_tx_period ON bank_transactions(period);

  period TEXT NOT NULL,CREATE INDEX idx_bank_tx_date ON bank_transactions(transaction_date);

  category_name TEXT NOT NULL,CREATE INDEX idx_bank_tx_category ON bank_transactions(category);

  sold_quantity INT DEFAULT 0,

  net_sales NUMERIC(12,2) DEFAULT 0,-- 6. Credit card transactions (Amex)

  vat_amount NUMERIC(12,2) DEFAULT 0,CREATE TABLE amex_transactions (

  sales_with_vat NUMERIC(12,2) DEFAULT 0,  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  net_discount NUMERIC(12,2) DEFAULT 0,  period TEXT NOT NULL, -- statement period

  discount_pct NUMERIC(5,2) DEFAULT 0,  operation_date DATE NOT NULL,

  purchase_value NUMERIC(12,2) DEFAULT 0,  booking_date DATE,

  sales_profit NUMERIC(12,2) DEFAULT 0,  description TEXT NOT NULL,

  created_at TIMESTAMPTZ DEFAULT now(),  amount_eur NUMERIC(12,2) NOT NULL,

  UNIQUE(client_id, period, category_name)  amount_foreign NUMERIC(12,2),

);  currency_foreign TEXT,

  exchange_rate NUMERIC(10,4),

-- 5. Bank transactions  category TEXT, -- 'subscription', 'travel', 'supply', 'baluwo', 'tax', etc.

CREATE TABLE bank_transactions (  created_at TIMESTAMPTZ DEFAULT now()

  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,);

  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  period TEXT NOT NULL,CREATE INDEX idx_amex_period ON amex_transactions(period);

  transaction_date DATE NOT NULL,

  value_date DATE,-- 7. Payroll / Cedolini

  amount NUMERIC(12,2) NOT NULL,CREATE TABLE payroll (

  description TEXT NOT NULL,  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  category TEXT,  period TEXT NOT NULL,

  subcategory TEXT,  employee_code INT,

  counterpart TEXT,  employee_name TEXT NOT NULL,

  running_balance NUMERIC(12,2),  role TEXT,

  raw_description TEXT,  part_time_pct NUMERIC(5,2) DEFAULT 100,

  created_at TIMESTAMPTZ DEFAULT now()  hire_date DATE,

);  hours_worked NUMERIC(6,2),

  days_worked INT,

CREATE INDEX idx_bank_tx_client_period ON bank_transactions(client_id, period);  gross_pay NUMERIC(10,2) NOT NULL,

CREATE INDEX idx_bank_tx_date ON bank_transactions(transaction_date);  social_contributions NUMERIC(10,2) DEFAULT 0,

  irpef NUMERIC(10,2) DEFAULT 0,

-- 6. Credit card transactions (Amex)  net_pay NUMERIC(10,2) NOT NULL,

CREATE TABLE amex_transactions (  tfr_month NUMERIC(10,2) DEFAULT 0,

  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,  additional_regional NUMERIC(10,2) DEFAULT 0,

  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,  additional_municipal NUMERIC(10,2) DEFAULT 0,

  period TEXT NOT NULL,  total_deductions NUMERIC(10,2) DEFAULT 0,

  operation_date DATE NOT NULL,  created_at TIMESTAMPTZ DEFAULT now(),

  booking_date DATE,  UNIQUE(period, employee_name)

  description TEXT NOT NULL,);

  amount_eur NUMERIC(12,2) NOT NULL,

  amount_foreign NUMERIC(12,2),-- 8. File upload tracking

  currency_foreign TEXT,CREATE TABLE file_uploads (

  exchange_rate NUMERIC(10,4),  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  category TEXT,  filename TEXT NOT NULL,

  created_at TIMESTAMPTZ DEFAULT now()  file_type TEXT NOT NULL, -- 'sales_by_category', 'bank_movements', 'amex_statement', 'payroll', 'budget', 'invoices'

);  period TEXT,

  storage_path TEXT NOT NULL,

CREATE INDEX idx_amex_client_period ON amex_transactions(client_id, period);  status TEXT DEFAULT 'uploaded', -- 'uploaded', 'parsing', 'parsed', 'error'

  error_message TEXT,

-- 7. Payroll / Cedolini  rows_imported INT DEFAULT 0,

CREATE TABLE payroll (  uploaded_at TIMESTAMPTZ DEFAULT now(),

  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,  parsed_at TIMESTAMPTZ

  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,);

  period TEXT NOT NULL,

  employee_code INT,-- 9. Auto-update timestamp trigger

  employee_name TEXT NOT NULL,CREATE OR REPLACE FUNCTION update_updated_at()

  role TEXT,RETURNS TRIGGER AS $$

  part_time_pct NUMERIC(5,2) DEFAULT 100,BEGIN

  hire_date DATE,  NEW.updated_at = now();

  hours_worked NUMERIC(6,2),  RETURN NEW;

  days_worked INT,END;

  gross_pay NUMERIC(10,2) NOT NULL,$$ LANGUAGE plpgsql;

  social_contributions NUMERIC(10,2) DEFAULT 0,

  irpef NUMERIC(10,2) DEFAULT 0,CREATE TRIGGER trg_monthly_summary_updated

  net_pay NUMERIC(10,2) NOT NULL,  BEFORE UPDATE ON monthly_summary

  tfr_month NUMERIC(10,2) DEFAULT 0,  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

  additional_regional NUMERIC(10,2) DEFAULT 0,

  additional_municipal NUMERIC(10,2) DEFAULT 0,-- 10. Supabase Storage bucket

  total_deductions NUMERIC(10,2) DEFAULT 0,-- Run in Supabase dashboard > Storage > Create bucket: "documents"

  created_at TIMESTAMPTZ DEFAULT now(),-- Set policy: authenticated users can upload, service role can read

  UNIQUE(client_id, period, employee_name)

);-- 11. RLS Policies (basic - adjust for your auth setup)

ALTER TABLE monthly_summary ENABLE ROW LEVEL SECURITY;

-- 8. File upload trackingALTER TABLE revenue_lines ENABLE ROW LEVEL SECURITY;

CREATE TABLE file_uploads (ALTER TABLE expense_lines ENABLE ROW LEVEL SECURITY;

  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,ALTER TABLE sales_by_category ENABLE ROW LEVEL SECURITY;

  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;

  filename TEXT NOT NULL,ALTER TABLE amex_transactions ENABLE ROW LEVEL SECURITY;

  file_type TEXT NOT NULL,ALTER TABLE payroll ENABLE ROW LEVEL SECURITY;

  period TEXT,ALTER TABLE file_uploads ENABLE ROW LEVEL SECURITY;

  storage_path TEXT NOT NULL,

  status TEXT DEFAULT 'uploaded',-- Allow all for service role (API routes use service key)

  error_message TEXT,CREATE POLICY "Service role full access" ON monthly_summary FOR ALL USING (true);

  rows_imported INT DEFAULT 0,CREATE POLICY "Service role full access" ON revenue_lines FOR ALL USING (true);

  uploaded_by UUID REFERENCES auth.users(id),CREATE POLICY "Service role full access" ON expense_lines FOR ALL USING (true);

  uploaded_at TIMESTAMPTZ DEFAULT now(),CREATE POLICY "Service role full access" ON sales_by_category FOR ALL USING (true);

  parsed_at TIMESTAMPTZCREATE POLICY "Service role full access" ON bank_transactions FOR ALL USING (true);

);CREATE POLICY "Service role full access" ON amex_transactions FOR ALL USING (true);

CREATE POLICY "Service role full access" ON payroll FOR ALL USING (true);

-- ══════════════════════════════════════════════════════════════CREATE POLICY "Service role full access" ON file_uploads FOR ALL USING (true);

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
