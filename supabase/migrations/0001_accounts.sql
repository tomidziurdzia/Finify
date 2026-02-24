-- ============================================================
-- 0001_accounts.sql
-- Currencies (reference table) + Accounts CRUD
-- ============================================================

-- 1. Currency type enum
-- ============================================================
CREATE TYPE public.currency_type AS ENUM ('fiat', 'crypto', 'etf');

-- 2. Currencies table (public reference data)
-- ============================================================
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

-- Seed currencies
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

-- 3. Account type enum
-- ============================================================
CREATE TYPE public.account_type AS ENUM (
  'bank',
  'investment_broker',
  'crypto_exchange',
  'crypto_wallet',
  'cash',
  'other'
);

-- 4. Accounts table
-- ============================================================
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

-- 5. RLS policies for accounts
-- ============================================================
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

-- 6. Generic updated_at trigger (reusable for future tables)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_accounts_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.accounts DROP CONSTRAINT accounts_user_id_name_key;
ALTER TABLE public.accounts ADD CONSTRAINT accounts_user_id_name_currency_key UNIQUE (user_id, name, currency);
