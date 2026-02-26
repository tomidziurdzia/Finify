-- ============================================================
-- 0006_budget_planning.sql
-- Budget híbrido: líneas + planes mensuales + reglas recurrentes
-- ============================================================

CREATE TYPE public.budget_rule_mode AS ENUM ('set', 'add');

CREATE TABLE public.budget_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id   UUID NOT NULL REFERENCES public.budget_categories(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, category_id, name)
);

CREATE INDEX idx_budget_lines_user_category
  ON public.budget_lines(user_id, category_id);

CREATE INDEX idx_budget_lines_user_active
  ON public.budget_lines(user_id, is_active);

ALTER TABLE public.budget_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own budget_lines"
  ON public.budget_lines FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_budget_lines_updated_at
  BEFORE UPDATE ON public.budget_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE public.budget_month_plans (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id        UUID NOT NULL REFERENCES public.budget_lines(id) ON DELETE CASCADE,
  month_id       UUID NOT NULL REFERENCES public.months(id) ON DELETE CASCADE,
  planned_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(line_id, month_id)
);

CREATE INDEX idx_budget_month_plans_month
  ON public.budget_month_plans(month_id);

CREATE INDEX idx_budget_month_plans_line
  ON public.budget_month_plans(line_id);

ALTER TABLE public.budget_month_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own budget_month_plans"
  ON public.budget_month_plans FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.budget_lines l
      WHERE l.id = line_id
        AND l.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.budget_lines l
      WHERE l.id = line_id
        AND l.user_id = auth.uid()
    )
  );

CREATE TRIGGER set_budget_month_plans_updated_at
  BEFORE UPDATE ON public.budget_month_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE public.budget_recurrence_rules (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id        UUID NOT NULL REFERENCES public.budget_lines(id) ON DELETE CASCADE,
  start_month_id UUID NOT NULL REFERENCES public.months(id) ON DELETE CASCADE,
  end_month_id   UUID REFERENCES public.months(id) ON DELETE SET NULL,
  mode           public.budget_rule_mode NOT NULL DEFAULT 'set',
  amount         NUMERIC(18,4) NOT NULL,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (start_month_id <> end_month_id)
);

CREATE INDEX idx_budget_rules_line
  ON public.budget_recurrence_rules(line_id);

CREATE INDEX idx_budget_rules_active
  ON public.budget_recurrence_rules(is_active);

ALTER TABLE public.budget_recurrence_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own budget_recurrence_rules"
  ON public.budget_recurrence_rules FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.budget_lines l
      WHERE l.id = line_id
        AND l.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.budget_lines l
      WHERE l.id = line_id
        AND l.user_id = auth.uid()
    )
  );

CREATE TRIGGER set_budget_recurrence_rules_updated_at
  BEFORE UPDATE ON public.budget_recurrence_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Backfill inicial: 1 línea por categoría existente
INSERT INTO public.budget_lines (user_id, category_id, name, display_order, is_active)
SELECT
  c.user_id,
  c.id,
  c.name,
  c.display_order,
  true
FROM public.budget_categories c
ON CONFLICT (user_id, category_id, name) DO NOTHING;

-- Backfill mensual: replicar monthly_amount actual en todos los meses existentes del usuario
INSERT INTO public.budget_month_plans (line_id, month_id, planned_amount)
SELECT
  l.id AS line_id,
  m.id AS month_id,
  c.monthly_amount AS planned_amount
FROM public.budget_lines l
JOIN public.budget_categories c ON c.id = l.category_id
JOIN public.months m ON m.user_id = l.user_id
ON CONFLICT (line_id, month_id) DO NOTHING;
