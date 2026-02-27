-- ============================================================
-- 0008_net_worth.sql
-- Patrimonio neto: ítems (activos/pasivos) + snapshots mensuales
-- ============================================================

CREATE TYPE public.nw_item_side AS ENUM ('asset', 'liability');

CREATE TABLE public.nw_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  side          public.nw_item_side NOT NULL,
  account_id    UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  currency      TEXT NOT NULL REFERENCES public.currencies(code),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_nw_items_user ON public.nw_items(user_id);
CREATE INDEX idx_nw_items_side ON public.nw_items(user_id, side);

ALTER TABLE public.nw_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own nw_items"
  ON public.nw_items FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_nw_items_updated_at
  BEFORE UPDATE ON public.nw_items
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE public.nw_snapshots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nw_item_id  UUID NOT NULL REFERENCES public.nw_items(id) ON DELETE CASCADE,
  year        INTEGER NOT NULL,
  month       INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  amount      NUMERIC(18,4) NOT NULL,
  amount_base NUMERIC(18,4),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(nw_item_id, year, month)
);

CREATE INDEX idx_nw_snapshots_item ON public.nw_snapshots(nw_item_id);
CREATE INDEX idx_nw_snapshots_year_month ON public.nw_snapshots(nw_item_id, year, month);

ALTER TABLE public.nw_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own nw_snapshots"
  ON public.nw_snapshots FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.nw_items i
      WHERE i.id = nw_item_id
        AND i.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.nw_items i
      WHERE i.id = nw_item_id
        AND i.user_id = auth.uid()
    )
  );
