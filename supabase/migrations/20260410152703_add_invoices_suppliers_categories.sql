-- ══════════════════════════════════════════════════════════════
-- Suppliers (fornitori salvati per riutilizzo)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS suppliers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, name)
);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Client data access" ON suppliers;
CREATE POLICY "Client data access" ON suppliers FOR ALL USING (
  EXISTS (SELECT 1 FROM user_clients WHERE user_id = auth.uid() AND client_id = suppliers.client_id)
);

-- ══════════════════════════════════════════════════════════════
-- Invoice categories (categorie personalizzabili per cliente)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS invoice_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, name)
);

ALTER TABLE invoice_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Client data access" ON invoice_categories;
CREATE POLICY "Client data access" ON invoice_categories FOR ALL USING (
  EXISTS (SELECT 1 FROM user_clients WHERE user_id = auth.uid() AND client_id = invoice_categories.client_id)
);

-- ══════════════════════════════════════════════════════════════
-- Invoices (fatture fornitori)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  import_batch_id UUID REFERENCES import_batches(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  category_name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_client_period ON invoices(client_id, period);
CREATE INDEX IF NOT EXISTS idx_invoices_batch ON invoices(import_batch_id);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Client data access" ON invoices;
CREATE POLICY "Client data access" ON invoices FOR ALL USING (
  EXISTS (SELECT 1 FROM user_clients WHERE user_id = auth.uid() AND client_id = invoices.client_id)
);
