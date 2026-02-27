-- ============================================================
-- 0007_fix_opening_balance_fk.sql
-- Change opening_balances.account_id FK from RESTRICT to CASCADE
-- so that deleting/deactivating an account doesn't fail due to
-- historical opening balance rows.
-- ============================================================

ALTER TABLE public.opening_balances
  DROP CONSTRAINT opening_balances_account_id_fkey;

ALTER TABLE public.opening_balances
  ADD CONSTRAINT opening_balances_account_id_fkey
    FOREIGN KEY (account_id)
    REFERENCES public.accounts(id)
    ON DELETE CASCADE;
