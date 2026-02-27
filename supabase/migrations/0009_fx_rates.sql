-- ============================================================
-- 0009_fx_rates.sql
-- Tabla de tipos de cambio históricos (FX) cacheados
-- ============================================================

CREATE TABLE public.fx_rates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_date     DATE NOT NULL,
  from_currency TEXT NOT NULL REFERENCES public.currencies(code),
  to_currency   TEXT NOT NULL REFERENCES public.currencies(code),
  rate          NUMERIC(18,8) NOT NULL CHECK (rate > 0),
  source        TEXT NOT NULL DEFAULT 'frankfurter',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (rate_date, from_currency, to_currency, source)
);

