-- ============================================================
-- 0031: Allow same account name + currency across different types
-- ============================================================
-- The original UNIQUE(user_id, name, currency) blocked e.g. a "Banco Galicia"
-- bank account and a "Banco Galicia" credit card in the same currency. Include
-- account_type so the name+currency pair can repeat across account types.

ALTER TABLE public.accounts
  DROP CONSTRAINT IF EXISTS accounts_user_id_name_currency_key;

ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_user_id_name_currency_account_type_key
  UNIQUE (user_id, name, currency, account_type);
