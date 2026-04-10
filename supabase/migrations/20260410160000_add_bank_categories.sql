-- Bank cost categories (customizable per client)
CREATE TABLE IF NOT EXISTS bank_categories (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(client_id, name)
);

ALTER TABLE bank_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_bank_categories" ON bank_categories FOR ALL USING (true) WITH CHECK (true);

-- Add cost_category column to bank_transactions
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS cost_category text DEFAULT '';
