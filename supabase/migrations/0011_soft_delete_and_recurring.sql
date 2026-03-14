-- ============================================================
-- 0011: Soft-delete for transactions + Recurring transactions + Transaction rules
-- ============================================================

-- 1. Soft-delete: add deleted_at to transactions
ALTER TABLE transactions ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Partial index: only index non-deleted rows for fast normal queries
CREATE INDEX idx_transactions_not_deleted
  ON transactions (user_id, month_id)
  WHERE deleted_at IS NULL;

-- 2. Recurring transactions
CREATE TABLE recurring_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category_id UUID REFERENCES budget_categories(id) ON DELETE SET NULL,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL REFERENCES currencies(code),
  exchange_rate NUMERIC(18,8) DEFAULT 1,
  base_amount NUMERIC(18,2),
  recurrence TEXT NOT NULL CHECK (recurrence IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
  day_of_month INT CHECK (day_of_month BETWEEN 1 AND 31),
  day_of_week INT CHECK (day_of_week BETWEEN 0 AND 6),
  start_date DATE NOT NULL,
  end_date DATE,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE recurring_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own recurring"
  ON recurring_transactions FOR ALL
  USING (auth.uid() = user_id);

CREATE TRIGGER set_recurring_updated_at
  BEFORE UPDATE ON recurring_transactions
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- 3. Transaction rules (auto-categorization)
CREATE TABLE transaction_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  match_field TEXT NOT NULL CHECK (match_field IN ('description', 'notes')),
  match_type TEXT NOT NULL CHECK (match_type IN ('contains', 'starts_with', 'exact')),
  match_value TEXT NOT NULL,
  action_category_id UUID REFERENCES budget_categories(id) ON DELETE SET NULL,
  action_rename TEXT,
  priority INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE transaction_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own rules"
  ON transaction_rules FOR ALL
  USING (auth.uid() = user_id);

CREATE TRIGGER set_transaction_rules_updated_at
  BEFORE UPDATE ON transaction_rules
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
