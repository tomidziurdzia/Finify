-- Investments table for tracking portfolio purchases
CREATE TABLE public.investments (
  id             UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID           NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id     UUID           NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  asset_name     TEXT           NOT NULL,
  ticker         TEXT,
  asset_type     TEXT           NOT NULL DEFAULT 'stock',
  quantity       NUMERIC(18,8)  NOT NULL CHECK (quantity > 0),
  price_per_unit NUMERIC(18,8)  NOT NULL CHECK (price_per_unit > 0),
  total_cost     NUMERIC(18,4)  NOT NULL CHECK (total_cost > 0),
  currency       TEXT           NOT NULL REFERENCES public.currencies(code),
  purchase_date  DATE           NOT NULL,
  notes          TEXT,
  created_at     TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ    NOT NULL DEFAULT now()
);

ALTER TABLE public.investments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "investments_select" ON public.investments
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "investments_insert" ON public.investments
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "investments_update" ON public.investments
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "investments_delete" ON public.investments
  FOR DELETE USING (auth.uid() = user_id);
