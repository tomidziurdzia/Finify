-- ============================================================
-- 0012: Savings Goals
-- ============================================================

CREATE TABLE savings_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_amount NUMERIC(18,2) NOT NULL,
  current_amount NUMERIC(18,2) DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR' REFERENCES currencies(code),
  deadline DATE,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  color TEXT DEFAULT '#3b82f6',
  is_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE savings_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own goals"
  ON savings_goals FOR ALL
  USING (auth.uid() = user_id);

CREATE TRIGGER set_savings_goals_updated_at
  BEFORE UPDATE ON savings_goals
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Link transactions to savings goals (optional)
ALTER TABLE transactions
  ADD COLUMN savings_goal_id UUID REFERENCES savings_goals(id) ON DELETE SET NULL;

-- Index for efficient lookup of transactions linked to a savings goal
CREATE INDEX idx_transactions_savings_goal_id
  ON transactions (savings_goal_id)
  WHERE savings_goal_id IS NOT NULL;
