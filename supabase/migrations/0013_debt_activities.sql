-- Debt activities: ledger for payments, interest charges, and adjustments on debts
-- Links to nw_items (liability) and optionally to transactions (for payments)

CREATE TYPE public.debt_activity_type AS ENUM ('payment', 'interest', 'adjustment');

CREATE TABLE public.debt_activities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nw_item_id      UUID NOT NULL REFERENCES public.nw_items(id) ON DELETE CASCADE,
  transaction_id  UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  activity_type   public.debt_activity_type NOT NULL,
  date            DATE NOT NULL,
  amount          NUMERIC(18,4) NOT NULL,
  amount_base     NUMERIC(18,4),
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_debt_activities_item ON public.debt_activities(nw_item_id);
CREATE INDEX idx_debt_activities_item_date ON public.debt_activities(nw_item_id, date);

ALTER TABLE public.debt_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own debt_activities"
  ON public.debt_activities FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.nw_items i
      WHERE i.id = debt_activities.nw_item_id AND i.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.nw_items i
      WHERE i.id = debt_activities.nw_item_id AND i.user_id = auth.uid()
    )
  );
