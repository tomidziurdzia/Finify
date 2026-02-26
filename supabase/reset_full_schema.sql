-- ============================================================
-- reset_full_schema.sql
-- Resetea y recrea TODO el esquema public de Finify
-- (0001 + 0002 + 0003 + 0004 + 0005 consolidados)
-- ============================================================

-- Nota:
-- - Esto NO elimina la base de datos física.
-- - Sí elimina y recrea todas las tablas/funciones/tipos del esquema public usadas por la app.

BEGIN;

-- ------------------------------------------------------------
-- 0) DROP (en orden seguro)
-- ------------------------------------------------------------

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

DROP TABLE IF EXISTS public.transaction_amounts CASCADE;
DROP TABLE IF EXISTS public.opening_balances CASCADE;
DROP TABLE IF EXISTS public.transactions CASCADE;
DROP TABLE IF EXISTS public.months CASCADE;
DROP TABLE IF EXISTS public.budget_month_overrides CASCADE;
DROP TABLE IF EXISTS public.budget_subcategories CASCADE;
DROP TABLE IF EXISTS public.budget_categories CASCADE;
DROP TABLE IF EXISTS public.budget_years CASCADE;
DROP TABLE IF EXISTS public.user_preferences CASCADE;
DROP TABLE IF EXISTS public.accounts CASCADE;
DROP TABLE IF EXISTS public.currencies CASCADE;

DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.handle_updated_at() CASCADE;

DROP TYPE IF EXISTS public.transaction_type CASCADE;
DROP TYPE IF EXISTS public.budget_category_type CASCADE;
DROP TYPE IF EXISTS public.account_type CASCADE;
DROP TYPE IF EXISTS public.currency_type CASCADE;

-- ------------------------------------------------------------
-- 1) Tipos base
-- ------------------------------------------------------------

CREATE TYPE public.currency_type AS ENUM ('fiat', 'crypto', 'etf');

CREATE TYPE public.account_type AS ENUM (
  'bank',
  'investment_broker',
  'crypto_exchange',
  'crypto_wallet',
  'cash',
  'other'
);

CREATE TYPE public.budget_category_type AS ENUM (
  'income',
  'essential_expenses',
  'discretionary_expenses',
  'debt_payments',
  'savings',
  'investments'
);

CREATE TYPE public.transaction_type AS ENUM (
  'income',
  'expense',
  'transfer',
  'correction'
);

-- ------------------------------------------------------------
-- 2) Función reutilizable updated_at
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- 3) Currencies
-- ------------------------------------------------------------

CREATE TABLE public.currencies (
  code          TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  symbol        TEXT NOT NULL,
  currency_type public.currency_type NOT NULL,
  decimals      INTEGER NOT NULL DEFAULT 2
);

ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read currencies"
  ON public.currencies FOR SELECT
  USING (true);

INSERT INTO public.currencies (code, name, symbol, currency_type, decimals) VALUES
  ('EUR', 'Euro',                    '€',    'fiat',   2),
  ('USD', 'US Dollar',               '$',    'fiat',   2),
  ('DKK', 'Danish Krone',            'kr',   'fiat',   2),
  ('ARS', 'Argentine Peso',          '$',    'fiat',   2),
  ('GBP', 'British Pound',           '£',    'fiat',   2),
  ('CHF', 'Swiss Franc',             'Fr',   'fiat',   2),
  ('NOK', 'Norwegian Krone',         'kr',   'fiat',   2),
  ('SEK', 'Swedish Krona',           'kr',   'fiat',   2),
  ('ETH', 'Ethereum',                'ETH',  'crypto', 8),
  ('BTC', 'Bitcoin',                 'BTC',  'crypto', 8),
  ('USDT', 'Tether',                 'USDT', 'crypto', 6),
  ('USDC', 'USD Coin',               'USDC', 'crypto', 6),
  ('SOL', 'Solana',                  'SOL',  'crypto', 8);

-- ------------------------------------------------------------
-- 4) Accounts
-- ------------------------------------------------------------

CREATE TABLE public.accounts (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  account_type  public.account_type NOT NULL,
  currency      TEXT        NOT NULL REFERENCES public.currencies(code),
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, name, currency)
);

CREATE INDEX idx_accounts_user_id ON public.accounts(user_id);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own accounts"
  ON public.accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own accounts"
  ON public.accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own accounts"
  ON public.accounts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own accounts"
  ON public.accounts FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER set_accounts_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ------------------------------------------------------------
-- 5) User preferences + budget
-- ------------------------------------------------------------

CREATE TABLE public.user_preferences (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  base_currency TEXT NOT NULL REFERENCES public.currencies(code),
  fx_source     TEXT NOT NULL DEFAULT 'frankfurter',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own preferences"
  ON public.user_preferences FOR ALL
  USING (auth.uid() = user_id);

CREATE TRIGGER set_user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE public.budget_years (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year    INTEGER NOT NULL,
  UNIQUE(user_id, year)
);

CREATE INDEX idx_budget_years_user ON public.budget_years(user_id);

ALTER TABLE public.budget_years ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own budget_years"
  ON public.budget_years FOR ALL
  USING (auth.uid() = user_id);

-- Estado final tras 0003: sin subcategorías, categoría editable por usuario
CREATE TABLE public.budget_categories (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_type  public.budget_category_type NOT NULL,
  name           TEXT NOT NULL,
  monthly_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  display_order  INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

CREATE INDEX idx_budget_categories_user ON public.budget_categories(user_id);

ALTER TABLE public.budget_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own budget_categories"
  ON public.budget_categories FOR ALL
  USING (auth.uid() = user_id);

CREATE TRIGGER set_budget_categories_updated_at
  BEFORE UPDATE ON public.budget_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Trigger de nuevo usuario (estado final tras 0003): solo preferencias
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_preferences (user_id, base_currency, fx_source)
  VALUES (NEW.id, 'USD', 'frankfurter');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------
-- 6) Months + opening balances
-- ------------------------------------------------------------

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

CREATE TABLE public.opening_balances (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month_id            UUID NOT NULL REFERENCES public.months(id) ON DELETE CASCADE,
  account_id          UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  opening_amount      NUMERIC(18,4) NOT NULL DEFAULT 0,
  opening_base_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(month_id, account_id)
);

CREATE INDEX idx_opening_balances_month ON public.opening_balances(month_id);
CREATE INDEX idx_opening_balances_account ON public.opening_balances(account_id);

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

-- ------------------------------------------------------------
-- 7) Transactions + transaction_amounts
-- ------------------------------------------------------------

CREATE TABLE public.transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month_id         UUID REFERENCES public.months(id) ON DELETE RESTRICT,
  category_id      UUID REFERENCES public.budget_categories(id) ON DELETE SET NULL,
  transaction_type public.transaction_type NOT NULL,
  date             DATE NOT NULL,
  description      TEXT NOT NULL,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transactions_user_date
  ON public.transactions(user_id, date);

CREATE INDEX idx_transactions_user_month_date
  ON public.transactions(user_id, month_id, date);

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

CREATE TRIGGER set_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE public.transaction_amounts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id    UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  account_id        UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  amount            NUMERIC(18,4) NOT NULL CHECK (amount <> 0),
  original_currency TEXT NOT NULL REFERENCES public.currencies(code),
  exchange_rate     NUMERIC(18,8) NOT NULL DEFAULT 1 CHECK (exchange_rate > 0),
  base_amount       NUMERIC(18,4) NOT NULL CHECK (base_amount <> 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(transaction_id, account_id)
);

CREATE INDEX idx_transaction_amounts_transaction
  ON public.transaction_amounts(transaction_id);

CREATE INDEX idx_transaction_amounts_account
  ON public.transaction_amounts(account_id);

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

COMMIT;
