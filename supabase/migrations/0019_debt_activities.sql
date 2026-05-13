-- Debt activities: ledger for payments, interest charges, and adjustments on debts
-- Links to nw_items (liability) and optionally to transactions (for payments)
--
-- NOTE: this migration was originally numbered 0013 and collided with
-- 0013_perf_rpc_aggregates.sql. The objects below were applied to production
-- manually before the collision was caught, so this file is written
-- idempotently — applying it to a database where the objects already exist
-- is a no-op and won't error.

DO $$ BEGIN
  CREATE TYPE public.debt_activity_type AS ENUM ('payment', 'interest', 'adjustment');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.debt_activities (
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

CREATE INDEX IF NOT EXISTS idx_debt_activities_item ON public.debt_activities(nw_item_id);
CREATE INDEX IF NOT EXISTS idx_debt_activities_item_date ON public.debt_activities(nw_item_id, date);

ALTER TABLE public.debt_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own debt_activities" ON public.debt_activities;
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
