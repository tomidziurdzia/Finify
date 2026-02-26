-- ============================================================
-- 0004_transactions.sql
-- Modelo estilo Jouve:
--   - 1 cabecera en transactions
--   - N líneas por cuenta en transaction_amounts
-- ============================================================

-- 1. Enum para tipo de transacción
CREATE TYPE public.transaction_type AS ENUM (
  'income',
  'expense',
  'transfer',
  'correction'
);

-- 2. Tabla cabecera: transactions
CREATE TABLE public.transactions (
  id               UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID                 NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id      UUID                 REFERENCES public.budget_categories(id) ON DELETE SET NULL,
  transaction_type public.transaction_type NOT NULL,
  date             DATE                 NOT NULL,
  description      TEXT                 NOT NULL,
  notes            TEXT,
  created_at       TIMESTAMPTZ          NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ          NOT NULL DEFAULT now()
);

-- 3. Tabla líneas: transaction_amounts
CREATE TABLE public.transaction_amounts (
  id                UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id    UUID           NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  account_id        UUID           NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  amount            NUMERIC(18,4)  NOT NULL CHECK (amount <> 0),
  original_currency TEXT           NOT NULL REFERENCES public.currencies(code),
  exchange_rate     NUMERIC(18,8)  NOT NULL DEFAULT 1 CHECK (exchange_rate > 0),
  base_amount       NUMERIC(18,4)  NOT NULL CHECK (base_amount <> 0),
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),
  UNIQUE(transaction_id, account_id)
);

-- 4. Indexes
CREATE INDEX idx_transactions_user_date
  ON public.transactions(user_id, date);

CREATE INDEX idx_transaction_amounts_transaction
  ON public.transaction_amounts(transaction_id);

CREATE INDEX idx_transaction_amounts_account
  ON public.transaction_amounts(account_id);

-- 5. RLS transactions
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON public.transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions"
  ON public.transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own transactions"
  ON public.transactions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own transactions"
  ON public.transactions FOR DELETE
  USING (auth.uid() = user_id);

-- 6. RLS transaction_amounts (hereda ownership vía cabecera)
ALTER TABLE public.transaction_amounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transaction amounts"
  ON public.transaction_amounts FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.transactions t
      WHERE t.id = transaction_id
        AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own transaction amounts"
  ON public.transaction_amounts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.transactions t
      WHERE t.id = transaction_id
        AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own transaction amounts"
  ON public.transaction_amounts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.transactions t
      WHERE t.id = transaction_id
        AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.transactions t
      WHERE t.id = transaction_id
        AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own transaction amounts"
  ON public.transaction_amounts FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.transactions t
      WHERE t.id = transaction_id
        AND t.user_id = auth.uid()
    )
  );

-- 7. Trigger updated_at (reutiliza handle_updated_at() de 0001_accounts.sql)
CREATE TRIGGER set_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
