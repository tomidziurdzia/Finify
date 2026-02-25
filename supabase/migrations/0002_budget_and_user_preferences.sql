-- ============================================================
-- 0002_budget_and_user_preferences.sql
-- user_preferences + presupuesto (años, categorías, subcategorías, overrides)
-- + trigger: nuevo usuario → user_preferences (USD) + 6 categorías
-- ============================================================

-- 1. Budget category type enum
-- ============================================================
CREATE TYPE public.budget_category_type AS ENUM (
  'income',
  'essential_expenses',
  'discretionary_expenses',
  'debt_payments',
  'savings',
  'investments'
);

-- 2. User preferences
-- ============================================================
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

-- 3. Budget years
-- ============================================================
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

-- 4. Budget categories (6 fijas por usuario)
-- ============================================================
CREATE TABLE public.budget_categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_type public.budget_category_type NOT NULL,
  name          TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_system     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, category_type)
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

-- 5. Budget subcategories
-- ============================================================
CREATE TABLE public.budget_subcategories (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id    UUID NOT NULL REFERENCES public.budget_categories(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  monthly_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  display_order  INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(category_id, name)
);

CREATE INDEX idx_budget_subcategories_category ON public.budget_subcategories(category_id);

ALTER TABLE public.budget_subcategories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own budget_subcategories"
  ON public.budget_subcategories FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.budget_categories c
      WHERE c.id = category_id AND c.user_id = auth.uid()
    )
  );

CREATE TRIGGER set_budget_subcategories_updated_at
  BEFORE UPDATE ON public.budget_subcategories
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 6. Budget month overrides (ajuste de monto por mes)
-- ============================================================
CREATE TABLE public.budget_month_overrides (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subcategory_id UUID NOT NULL REFERENCES public.budget_subcategories(id) ON DELETE CASCADE,
  year           INTEGER NOT NULL,
  month          INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  amount         NUMERIC(18,4) NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(subcategory_id, year, month)
);

CREATE INDEX idx_budget_month_overrides_sub ON public.budget_month_overrides(subcategory_id);

ALTER TABLE public.budget_month_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own budget_month_overrides"
  ON public.budget_month_overrides FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.budget_subcategories s
      JOIN public.budget_categories c ON c.id = s.category_id
      WHERE s.id = subcategory_id AND c.user_id = auth.uid()
    )
  );

-- 7. Trigger: new user → user_preferences + 6 budget categories
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_preferences (user_id, base_currency, fx_source)
  VALUES (NEW.id, 'USD', 'frankfurter');

  INSERT INTO public.budget_categories (user_id, category_type, name, display_order, is_system)
  VALUES
    (NEW.id, 'income', 'Ingresos', 1, true),
    (NEW.id, 'essential_expenses', 'Gastos Esenciales', 2, true),
    (NEW.id, 'discretionary_expenses', 'Gastos Discrecionales', 3, true),
    (NEW.id, 'debt_payments', 'Pago de Deudas', 4, true),
    (NEW.id, 'savings', 'Ahorros', 5, true),
    (NEW.id, 'investments', 'Inversiones', 6, true);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
