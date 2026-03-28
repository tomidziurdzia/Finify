alter table public.investments
add column if not exists isin text;

create index if not exists idx_investments_isin
  on public.investments(isin)
  where isin is not null;
