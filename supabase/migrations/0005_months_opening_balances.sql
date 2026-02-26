-- ============================================================
-- 0005_months_opening_balances.sql
-- Meses contables + saldos iniciales por cuenta
-- ============================================================

-- 1. Meses
CREATE TABLE public.months (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year       INTEGER NOT NULL,
  month      INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, year, month)
);

CREATE INDEX idx_months_user_year_month
  ON public.months(user_id, year, month);

ALTER TABLE public.months ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own months"
  ON public.months FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own months"
  ON public.months FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own months"
  ON public.months FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own months"
  ON public.months FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER set_months_updated_at
  BEFORE UPDATE ON public.months
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 2. Saldos iniciales por mes/cuenta
CREATE TABLE public.opening_balances (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month_id            UUID NOT NULL REFERENCES public.months(id) ON DELETE CASCADE,
  account_id          UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  opening_amount      NUMERIC(18,4) NOT NULL DEFAULT 0,
  opening_base_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(month_id, account_id)
);

CREATE INDEX idx_opening_balances_month
  ON public.opening_balances(month_id);

CREATE INDEX idx_opening_balances_account
  ON public.opening_balances(account_id);

ALTER TABLE public.opening_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own opening balances"
  ON public.opening_balances FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.months m
      WHERE m.id = month_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own opening balances"
  ON public.opening_balances FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.months m
      WHERE m.id = month_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own opening balances"
  ON public.opening_balances FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.months m
      WHERE m.id = month_id
        AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.months m
      WHERE m.id = month_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own opening balances"
  ON public.opening_balances FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.months m
      WHERE m.id = month_id
        AND m.user_id = auth.uid()
    )
  );

-- 3. Transacciones asociadas a mes contable
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS month_id UUID REFERENCES public.months(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_transactions_user_month_date
  ON public.transactions(user_id, month_id, date);
