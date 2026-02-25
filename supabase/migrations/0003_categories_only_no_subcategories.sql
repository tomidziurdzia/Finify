-- ============================================================
-- 0003_categories_only_no_subcategories.sql
-- Solo categorías: se eliminan subcategorías y overrides.
-- Cada categoría tiene: name, budget_type (tipo de movimiento), monthly_amount.
-- ============================================================

-- 1. Eliminar tablas que dependen de subcategorías
-- ============================================================
DROP TABLE IF EXISTS public.budget_month_overrides;
DROP TABLE IF EXISTS public.budget_subcategories;

-- 2. Alterar budget_categories: agregar monthly_amount, cambiar unicidad
-- ============================================================
ALTER TABLE public.budget_categories
  DROP CONSTRAINT IF EXISTS budget_categories_user_id_category_type_key;

ALTER TABLE public.budget_categories
  ADD COLUMN IF NOT EXISTS monthly_amount NUMERIC(18,4) NOT NULL DEFAULT 0;

ALTER TABLE public.budget_categories
  DROP COLUMN IF EXISTS is_system;

ALTER TABLE public.budget_categories
  ADD CONSTRAINT budget_categories_user_id_name_key UNIQUE (user_id, name);

-- 3. Vaciar las 6 filas fijas (el usuario crea sus propias categorías)
-- ============================================================
DELETE FROM public.budget_categories;

-- 4. Trigger: nuevo usuario solo recibe user_preferences (sin categorías)
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
  RETURN NEW;
END;
$$;
