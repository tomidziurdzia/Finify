-- ============================================================
-- 0028: Add 'investment' to the transaction_type enum
-- ============================================================
-- Investment buys/sells (and transfer fees) were recorded as 'correction';
-- they now use a dedicated 'investment' type so they read as "Inversión".
-- ADD VALUE must be committed before the value can be used, so the backfill
-- lives in the next migration (0029).

ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'investment';
