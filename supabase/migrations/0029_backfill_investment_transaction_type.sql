-- ============================================================
-- 0029: Backfill investment-generated transactions to 'investment'
-- ============================================================
-- Reclassify existing auto-generated buy/sell corrections (those linked to an
-- investment or an investment sale) so they show as "Inversión" instead of
-- "Corrección". Manual corrections and transfer fees without a link are left
-- untouched.

UPDATE public.transactions
SET transaction_type = 'investment'
WHERE source_investment_id IS NOT NULL
   OR source_investment_sale_id IS NOT NULL;
