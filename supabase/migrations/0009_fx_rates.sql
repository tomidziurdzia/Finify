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

ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;

-- Permitir leer tipos de cambio a cualquier rol (anon/authenticated),
-- ya que no contienen datos sensibles por usuario.
CREATE POLICY "Allow select on fx_rates"
  ON public.fx_rates
  FOR SELECT
  USING (true);

-- Permitir insertar filas desde el backend (server actions) para cachear FX.
CREATE POLICY "Allow insert on fx_rates"
  ON public.fx_rates
  FOR INSERT
  WITH CHECK (true);

