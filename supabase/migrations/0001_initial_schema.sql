-- ============================================================
-- EXTENSIONS
-- ============================================================
create extension if not exists "uuid-ossp";

-- ============================================================
-- ENUM TYPES
-- ============================================================
create type budget_category_type as enum (
  'income',
  'essential_expenses',
  'discretionary_expenses',
  'debt_payments',
  'savings',
  'investments'
);

create type account_type as enum (
  'bank',
  'investment_broker',
  'crypto_exchange',
  'crypto_wallet',
  'cash',
  'other'
);

create type nw_item_type as enum (
  'bank_account',
  'investment',
  'crypto',
  'cash',
  'real_estate',
  'other_asset',
  'loan',
  'credit_card',
  'other_liability'
);

create type nw_item_side as enum ('asset', 'liability');

-- ============================================================
-- CURRENCIES
-- Public reference table. Seeded separately.
-- ============================================================
create table currencies (
  code        text primary key,
  name        text not null,
  symbol      text,
  is_crypto   boolean not null default false,
  is_fiat     boolean not null default true,
  decimals    int not null default 2,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- USER PREFERENCES
-- One row per auth user.
-- ============================================================
create table user_preferences (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  base_currency     text not null default 'USD' references currencies(code),
  fx_source         text not null default 'frankfurter',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ============================================================
-- ACCOUNTS
-- ============================================================
create table accounts (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  account_type    account_type not null,
  currency        text not null references currencies(code),
  is_active       boolean not null default true,
  display_order   int not null default 0,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint accounts_user_name_unique unique (user_id, name)
);

create index idx_accounts_user_id on accounts(user_id);

-- ============================================================
-- BUDGET YEARS
-- ============================================================
create table budget_years (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  year            int not null,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint budget_years_user_year_unique unique (user_id, year)
);

create index idx_budget_years_user_id on budget_years(user_id);

-- ============================================================
-- BUDGET CATEGORIES (Top-level, seeded via trigger)
-- ============================================================
create table budget_categories (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  category_type   budget_category_type not null,
  name            text not null,
  display_order   int not null default 0,
  is_system       boolean not null default true,
  created_at      timestamptz not null default now(),
  constraint budget_categories_user_type_unique unique (user_id, category_type)
);

create index idx_budget_categories_user_id on budget_categories(user_id);

-- ============================================================
-- BUDGET SUBCATEGORIES (Template — applies to all months)
-- ============================================================
create table budget_subcategories (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  category_id         uuid not null references budget_categories(id) on delete restrict,
  name                text not null,
  monthly_amount      numeric(18,2) not null default 0,
  currency            text not null default 'USD' references currencies(code),
  rollover_enabled    boolean not null default false,
  display_order       int not null default 0,
  is_active           boolean not null default true,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint budget_subcategories_user_category_name_unique unique (user_id, category_id, name)
);

create index idx_budget_subcategories_user_id on budget_subcategories(user_id);
create index idx_budget_subcategories_category_id on budget_subcategories(category_id);

-- ============================================================
-- BUDGET MONTH OVERRIDES
-- Sparse: only rows that differ from the template.
-- ============================================================
create table budget_month_overrides (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  budget_year_id      uuid not null references budget_years(id) on delete cascade,
  subcategory_id      uuid not null references budget_subcategories(id) on delete cascade,
  month               int not null check (month between 1 and 12),
  amount              numeric(18,2) not null,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint budget_month_overrides_unique unique (user_id, budget_year_id, subcategory_id, month)
);

create index idx_budget_month_overrides_year_id on budget_month_overrides(budget_year_id);
create index idx_budget_month_overrides_subcategory_id on budget_month_overrides(subcategory_id);

-- ============================================================
-- FX RATE CACHE
-- ============================================================
create table fx_rates (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  from_currency   text not null references currencies(code),
  to_currency     text not null references currencies(code),
  rate            numeric(18,8) not null,
  rate_date       date not null,
  source          text not null,
  fetched_at      timestamptz not null default now(),
  constraint fx_rates_unique unique (from_currency, to_currency, rate_date, source)
);

create index idx_fx_rates_pair_date on fx_rates(from_currency, to_currency, rate_date);

-- ============================================================
-- TRANSACTIONS
-- ============================================================
create table transactions (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  subcategory_id        uuid not null references budget_subcategories(id) on delete restrict,
  account_id            uuid not null references accounts(id) on delete restrict,
  budget_year_id        uuid not null references budget_years(id) on delete restrict,
  transaction_date      date not null,
  amount                numeric(18,8) not null,
  currency              text not null references currencies(code),
  fx_rate               numeric(18,8) not null,
  base_currency_amount  numeric(18,8) not null,
  base_currency         text not null references currencies(code),
  is_manual_fx          boolean not null default false,
  note                  text,
  transfer_group_id     uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Generated columns for fast year/month aggregation
alter table transactions
  add column transaction_year  int generated always as (extract(year from transaction_date)::int) stored,
  add column transaction_month int generated always as (extract(month from transaction_date)::int) stored;

create index idx_transactions_user_id on transactions(user_id);
create index idx_transactions_budget_year_id on transactions(budget_year_id);
create index idx_transactions_subcategory_id on transactions(subcategory_id);
create index idx_transactions_date on transactions(transaction_date);
create index idx_transactions_year_month on transactions(user_id, transaction_year, transaction_month);

-- ============================================================
-- NET WORTH ITEMS (Persistent)
-- ============================================================
create table nw_items (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  item_type       nw_item_type not null,
  side            nw_item_side not null,
  currency        text not null references currencies(code),
  account_id      uuid references accounts(id) on delete set null,
  display_order   int not null default 0,
  is_active       boolean not null default true,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint nw_items_user_name_unique unique (user_id, name)
);

create index idx_nw_items_user_id on nw_items(user_id);

-- ============================================================
-- NET WORTH SNAPSHOTS (Monthly, last day of month)
-- ============================================================
create table nw_snapshots (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  nw_item_id            uuid not null references nw_items(id) on delete cascade,
  snapshot_year         int not null,
  snapshot_month        int not null check (snapshot_month between 1 and 12),
  amount                numeric(18,8) not null,
  fx_rate               numeric(18,8) not null,
  base_currency_amount  numeric(18,8) not null,
  base_currency         text not null references currencies(code),
  is_manual_fx          boolean not null default false,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint nw_snapshots_unique unique (user_id, nw_item_id, snapshot_year, snapshot_month)
);

create index idx_nw_snapshots_user_id on nw_snapshots(user_id);
create index idx_nw_snapshots_item_id on nw_snapshots(nw_item_id);
create index idx_nw_snapshots_year_month on nw_snapshots(user_id, snapshot_year, snapshot_month);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table user_preferences      enable row level security;
alter table accounts               enable row level security;
alter table budget_years           enable row level security;
alter table budget_categories      enable row level security;
alter table budget_subcategories   enable row level security;
alter table budget_month_overrides enable row level security;
alter table fx_rates               enable row level security;
alter table transactions           enable row level security;
alter table nw_items               enable row level security;
alter table nw_snapshots           enable row level security;
alter table currencies             enable row level security;

-- Single-user policy: user sees only their own data
create policy "user_own_data" on user_preferences      for all using (auth.uid() = user_id);
create policy "user_own_data" on accounts               for all using (auth.uid() = user_id);
create policy "user_own_data" on budget_years           for all using (auth.uid() = user_id);
create policy "user_own_data" on budget_categories      for all using (auth.uid() = user_id);
create policy "user_own_data" on budget_subcategories   for all using (auth.uid() = user_id);
create policy "user_own_data" on budget_month_overrides for all using (auth.uid() = user_id);
create policy "user_own_data" on fx_rates               for all using (auth.uid() = user_id);
create policy "user_own_data" on transactions           for all using (auth.uid() = user_id);
create policy "user_own_data" on nw_items               for all using (auth.uid() = user_id);
create policy "user_own_data" on nw_snapshots           for all using (auth.uid() = user_id);

-- Currencies is public read
create policy "public_read_currencies" on currencies for select using (true);

-- ============================================================
-- VIEWS
-- ============================================================

-- Monthly budget vs actual per subcategory
create or replace view v_monthly_budget_actual as
select
  t.user_id,
  t.budget_year_id,
  t.transaction_year                                          as year,
  t.transaction_month                                         as month,
  bs.id                                                       as subcategory_id,
  bs.name                                                     as subcategory_name,
  bs.category_id,
  bc.category_type,
  bc.name                                                     as category_name,
  coalesce(bmo.amount, bs.monthly_amount)                     as budgeted_amount,
  bs.currency                                                 as budget_currency,
  bs.rollover_enabled,
  coalesce(sum(t.base_currency_amount), 0)                    as actual_amount
from budget_subcategories bs
join budget_categories bc on bc.id = bs.category_id
left join transactions t
  on t.subcategory_id = bs.id
left join budget_month_overrides bmo
  on bmo.subcategory_id = bs.id
  and bmo.budget_year_id = t.budget_year_id
  and bmo.month = t.transaction_month
where bs.is_active = true
group by
  t.user_id, t.budget_year_id, t.transaction_year, t.transaction_month,
  bs.id, bs.name, bs.category_id, bc.category_type, bc.name,
  bmo.amount, bs.monthly_amount, bs.currency, bs.rollover_enabled;

-- Monthly net worth totals
create or replace view v_monthly_net_worth as
select
  ns.user_id,
  ns.snapshot_year,
  ns.snapshot_month,
  sum(case when ni.side = 'asset'     then ns.base_currency_amount else 0 end)              as total_assets,
  sum(case when ni.side = 'liability' then ns.base_currency_amount else 0 end)              as total_liabilities,
  sum(case when ni.side = 'asset'     then ns.base_currency_amount else -ns.base_currency_amount end) as net_worth
from nw_snapshots ns
join nw_items ni on ni.id = ns.nw_item_id
group by ns.user_id, ns.snapshot_year, ns.snapshot_month;
