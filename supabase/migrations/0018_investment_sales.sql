-- Investment sales: track partial/total exits with realized P&L, fees and tax
CREATE TABLE public.investment_sales (
  id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID           NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id      UUID           NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  asset_name      TEXT           NOT NULL,
  ticker          TEXT,
  isin            TEXT,
  asset_type      TEXT           NOT NULL,
  quantity_sold   NUMERIC(18,8)  NOT NULL CHECK (quantity_sold > 0),
  price_per_unit  NUMERIC(18,8)  NOT NULL CHECK (price_per_unit > 0),
  total_proceeds  NUMERIC(18,4)  NOT NULL CHECK (total_proceeds >= 0),
  fees            NUMERIC(18,4)  NOT NULL DEFAULT 0 CHECK (fees >= 0),
  tax             NUMERIC(18,4)  NOT NULL DEFAULT 0 CHECK (tax >= 0),
  cost_basis      NUMERIC(18,4)  NOT NULL CHECK (cost_basis >= 0),
  realized_pnl    NUMERIC(18,4)  NOT NULL,
  currency        TEXT           NOT NULL REFERENCES public.currencies(code),
  sale_date       DATE           NOT NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX investment_sales_user_idx ON public.investment_sales (user_id, sale_date DESC);
CREATE INDEX investment_sales_account_idx ON public.investment_sales (account_id);

ALTER TABLE public.investment_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "investment_sales_select" ON public.investment_sales
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "investment_sales_insert" ON public.investment_sales
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "investment_sales_update" ON public.investment_sales
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "investment_sales_delete" ON public.investment_sales
  FOR DELETE USING (auth.uid() = user_id);
