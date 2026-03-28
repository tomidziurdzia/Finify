-- Performance RPCs and indexes for heavy aggregate reads

create index if not exists idx_transactions_user_month_type_date
  on public.transactions(user_id, month_id, transaction_type, date)
  where deleted_at is null;

create index if not exists idx_transaction_amounts_account_tx
  on public.transaction_amounts(account_id, transaction_id);

create index if not exists idx_budget_month_plans_month_line
  on public.budget_month_plans(month_id, line_id);

create index if not exists idx_nw_snapshots_year_month_item
  on public.nw_snapshots(year, month, nw_item_id);

create index if not exists idx_investments_user_account_purchase_date
  on public.investments(user_id, account_id, purchase_date);

create or replace function public.latest_fx_rate(
  p_reference_date date,
  p_from_currency text,
  p_to_currency text
) returns numeric
language sql
stable
as $$
  select case
    when p_from_currency = p_to_currency then 1::numeric
    else (
      select fx.rate
      from public.fx_rates fx
      where fx.from_currency = p_from_currency
        and fx.to_currency = p_to_currency
        and fx.rate_date <= p_reference_date
      order by fx.rate_date desc
      limit 1
    )
  end;
$$;

create or replace function public.resolve_base_currency(p_base_currency text default null)
returns text
language sql
stable
as $$
  select coalesce(
    p_base_currency,
    (
      select up.base_currency
      from public.user_preferences up
      where up.user_id = auth.uid()
      limit 1
    ),
    'USD'
  );
$$;

create or replace function public.usage_counts()
returns table (
  entity_type text,
  entity_id uuid,
  usage_count bigint
)
language sql
stable
as $$
  with account_counts as (
    select
      'account'::text as entity_type,
      ta.account_id as entity_id,
      count(*)::bigint as usage_count
    from public.transaction_amounts ta
    join public.transactions t on t.id = ta.transaction_id
    where t.user_id = auth.uid()
      and t.deleted_at is null
    group by ta.account_id
  ),
  category_counts as (
    select
      'category'::text as entity_type,
      t.category_id as entity_id,
      count(*)::bigint as usage_count
    from public.transactions t
    where t.user_id = auth.uid()
      and t.deleted_at is null
      and t.category_id is not null
    group by t.category_id
  )
  select * from account_counts
  union all
  select * from category_counts;
$$;

create or replace function public.opening_balances_with_current_base(
  p_month_id uuid,
  p_base_currency text default null
)
returns table (
  id uuid,
  month_id uuid,
  account_id uuid,
  opening_amount numeric,
  opening_base_amount numeric,
  created_at timestamptz,
  account_name text,
  account_currency text,
  account_currency_symbol text,
  current_opening_base_amount numeric
)
language sql
stable
as $$
  with base as (
    select public.resolve_base_currency(p_base_currency) as code
  ),
  target_month as (
    select m.id, make_date(m.year, m.month, 1) as fx_date
    from public.months m
    where m.id = p_month_id
      and m.user_id = auth.uid()
  )
  select
    ob.id,
    ob.month_id,
    ob.account_id,
    ob.opening_amount,
    ob.opening_base_amount,
    ob.created_at,
    a.name as account_name,
    a.currency as account_currency,
    c.symbol as account_currency_symbol,
    case
      when a.currency = base.code then ob.opening_amount
      else coalesce(
        ob.opening_amount * public.latest_fx_rate(tm.fx_date, a.currency, base.code),
        ob.opening_base_amount
      )
    end as current_opening_base_amount
  from public.opening_balances ob
  join target_month tm on tm.id = ob.month_id
  join public.accounts a on a.id = ob.account_id and a.user_id = auth.uid()
  join public.currencies c on c.code = a.currency
  cross join base
  order by ob.created_at asc;
$$;

create or replace function public.budget_summary_vs_actual(
  p_month_id uuid,
  p_base_currency text default null
)
returns table (
  category_id uuid,
  category_name text,
  category_type public.budget_category_type,
  planned_amount numeric,
  actual_amount numeric,
  variance numeric
)
language sql
stable
as $$
  with base as (
    select public.resolve_base_currency(p_base_currency) as code
  ),
  month_ctx as (
    select m.id, make_date(m.year, m.month, 1) as month_start
    from public.months m
    where m.id = p_month_id
      and m.user_id = auth.uid()
  ),
  plans as (
    select
      l.category_id,
      sum(bmp.planned_amount)::numeric as planned_amount
    from public.budget_month_plans bmp
    join public.budget_lines l on l.id = bmp.line_id
    join month_ctx mc on mc.id = bmp.month_id
    where l.user_id = auth.uid()
    group by l.category_id
  ),
  tx_actuals as (
    select
      t.category_id,
      sum(
        abs(
          case
            when ta.original_currency = base.code then ta.amount
            else coalesce(
              ta.amount * public.latest_fx_rate(t.date, ta.original_currency, base.code),
              ta.base_amount
            )
          end
        )
      )::numeric as actual_amount
    from public.transactions t
    join month_ctx mc on mc.id = t.month_id
    cross join base
    join lateral (
      select ta.*
      from public.transaction_amounts ta
      where ta.transaction_id = t.id
      order by ta.created_at asc
      limit 1
    ) ta on true
    where t.user_id = auth.uid()
      and t.deleted_at is null
      and t.transaction_type <> 'transfer'
      and t.category_id is not null
    group by t.category_id
  )
  select
    bc.id as category_id,
    bc.name as category_name,
    bc.category_type,
    coalesce(plans.planned_amount, 0) as planned_amount,
    coalesce(tx_actuals.actual_amount, 0) as actual_amount,
    coalesce(plans.planned_amount, 0) - coalesce(tx_actuals.actual_amount, 0) as variance
  from public.budget_categories bc
  left join plans on plans.category_id = bc.id
  left join tx_actuals on tx_actuals.category_id = bc.id
  where bc.user_id = auth.uid()
  order by bc.display_order asc, bc.name asc;
$$;

create or replace function public.budget_summary_vs_actual_range(
  p_start_month_id uuid,
  p_end_month_id uuid,
  p_base_currency text default null
)
returns table (
  category_id uuid,
  category_name text,
  category_type public.budget_category_type,
  planned_amount numeric,
  actual_amount numeric,
  variance numeric
)
language sql
stable
as $$
  with base as (
    select public.resolve_base_currency(p_base_currency) as code
  ),
  bounds as (
    select
      least(sm.year * 100 + sm.month, em.year * 100 + em.month) as start_code,
      greatest(sm.year * 100 + sm.month, em.year * 100 + em.month) as end_code
    from public.months sm
    join public.months em on em.id = p_end_month_id and em.user_id = auth.uid()
    where sm.id = p_start_month_id
      and sm.user_id = auth.uid()
  ),
  months_in_range as (
    select m.id
    from public.months m
    join bounds b on (m.year * 100 + m.month) between b.start_code and b.end_code
    where m.user_id = auth.uid()
  ),
  plans as (
    select
      l.category_id,
      sum(bmp.planned_amount)::numeric as planned_amount
    from public.budget_month_plans bmp
    join public.budget_lines l on l.id = bmp.line_id
    join months_in_range mir on mir.id = bmp.month_id
    where l.user_id = auth.uid()
    group by l.category_id
  ),
  tx_actuals as (
    select
      t.category_id,
      sum(
        abs(
          case
            when ta.original_currency = base.code then ta.amount
            else coalesce(
              ta.amount * public.latest_fx_rate(t.date, ta.original_currency, base.code),
              ta.base_amount
            )
          end
        )
      )::numeric as actual_amount
    from public.transactions t
    join months_in_range mir on mir.id = t.month_id
    cross join base
    join lateral (
      select ta.*
      from public.transaction_amounts ta
      where ta.transaction_id = t.id
      order by ta.created_at asc
      limit 1
    ) ta on true
    where t.user_id = auth.uid()
      and t.deleted_at is null
      and t.transaction_type <> 'transfer'
      and t.category_id is not null
    group by t.category_id
  )
  select
    bc.id as category_id,
    bc.name as category_name,
    bc.category_type,
    coalesce(plans.planned_amount, 0) as planned_amount,
    coalesce(tx_actuals.actual_amount, 0) as actual_amount,
    coalesce(plans.planned_amount, 0) - coalesce(tx_actuals.actual_amount, 0) as variance
  from public.budget_categories bc
  left join plans on plans.category_id = bc.id
  left join tx_actuals on tx_actuals.category_id = bc.id
  where bc.user_id = auth.uid()
  order by bc.display_order asc, bc.name asc;
$$;

create or replace function public.account_net_worth_year(
  p_year integer,
  p_base_currency text default null
)
returns table (
  year integer,
  month integer,
  account_id uuid,
  account_name text,
  account_type text,
  currency text,
  currency_symbol text,
  balance numeric,
  balance_base numeric,
  investment_value numeric,
  investment_value_base numeric
)
language sql
stable
as $$
  with base as (
    select public.resolve_base_currency(p_base_currency) as code
  ),
  latest_month as (
    select m.id, m.month
    from public.months m
    where m.user_id = auth.uid()
      and m.year = p_year
    order by m.month desc
    limit 1
  ),
  account_rows as (
    select
      a.id,
      a.name,
      a.account_type,
      a.currency,
      c.symbol as currency_symbol
    from public.accounts a
    join public.currencies c on c.code = a.currency
    where a.user_id = auth.uid()
      and a.is_active = true
  ),
  openings as (
    select
      ob.account_id,
      sum(ob.opening_amount)::numeric as opening_amount,
      sum(ob.opening_base_amount)::numeric as opening_base_amount
    from public.opening_balances ob
    join latest_month lm on lm.id = ob.month_id
    group by ob.account_id
  ),
  movements as (
    select
      ta.account_id,
      sum(ta.amount)::numeric as amount,
      sum(ta.base_amount)::numeric as base_amount
    from public.transaction_amounts ta
    join public.transactions t on t.id = ta.transaction_id
    join latest_month lm on lm.id = t.month_id
    where t.user_id = auth.uid()
      and t.deleted_at is null
    group by ta.account_id
  ),
  investments as (
    select
      i.account_id,
      sum(i.total_cost)::numeric as investment_value,
      sum(
        case
          when i.currency = base.code then i.total_cost
          else i.total_cost * coalesce(public.latest_fx_rate(current_date, i.currency, base.code), 1)
        end
      )::numeric as investment_value_base
    from public.investments i
    cross join base
    where i.user_id = auth.uid()
    group by i.account_id
  )
  select
    p_year as year,
    coalesce((select month from latest_month), 0) as month,
    a.id as account_id,
    a.name as account_name,
    a.account_type,
    a.currency,
    a.currency_symbol,
    coalesce(o.opening_amount, 0) + coalesce(m.amount, 0) as balance,
    coalesce(o.opening_base_amount, 0) + coalesce(m.base_amount, 0) as balance_base,
    coalesce(inv.investment_value, 0) as investment_value,
    coalesce(inv.investment_value_base, 0) as investment_value_base
  from account_rows a
  left join openings o on o.account_id = a.id
  left join movements m on m.account_id = a.id
  left join investments inv on inv.account_id = a.id
  where exists (select 1 from latest_month)
  order by a.account_type, a.name;
$$;

create or replace function public.liabilities_year(
  p_year integer,
  p_base_currency text default null
)
returns table (
  item_id uuid,
  name text,
  currency text,
  currency_symbol text,
  amount numeric,
  amount_base numeric
)
language sql
stable
as $$
  with base as (
    select public.resolve_base_currency(p_base_currency) as code
  ),
  items as (
    select i.id, i.name, i.currency, c.symbol as currency_symbol
    from public.nw_items i
    join public.currencies c on c.code = i.currency
    where i.user_id = auth.uid()
      and i.side = 'liability'
  ),
  latest_snapshots as (
    select distinct on (ns.nw_item_id)
      ns.nw_item_id,
      ns.amount,
      ns.amount_base,
      ns.month
    from public.nw_snapshots ns
    join items i on i.id = ns.nw_item_id
    where ns.year = p_year
    order by ns.nw_item_id, ns.month desc
  )
  select
    i.id as item_id,
    i.name,
    i.currency,
    i.currency_symbol,
    coalesce(ls.amount, 0) as amount,
    case
      when i.currency = base.code then coalesce(ls.amount, 0)
      else coalesce(
        ls.amount * public.latest_fx_rate(current_date, i.currency, base.code),
        ls.amount_base,
        ls.amount,
        0
      )
    end as amount_base
  from items i
  left join latest_snapshots ls on ls.nw_item_id = i.id
  cross join base
  order by i.name;
$$;

create or replace function public.net_worth_evolution_year(
  p_year integer,
  p_base_currency text default null
)
returns table (
  month integer,
  assets numeric,
  liabilities numeric,
  net_worth numeric
)
language sql
stable
as $$
  with base as (
    select public.resolve_base_currency(p_base_currency) as code
  ),
  months_in_year as (
    select m.id, m.month
    from public.months m
    where m.user_id = auth.uid()
      and m.year = p_year
  ),
  cash_assets as (
    select
      miy.month,
      coalesce(sum(ob.opening_base_amount), 0) + coalesce(sum(tx.line_base_amount), 0) as assets
    from months_in_year miy
    left join public.opening_balances ob on ob.month_id = miy.id
    left join (
      select
        t.month_id,
        ta.base_amount as line_base_amount
      from public.transactions t
      join public.transaction_amounts ta on ta.transaction_id = t.id
      where t.user_id = auth.uid()
        and t.deleted_at is null
    ) tx on tx.month_id = miy.id
    group by miy.month
  ),
  investment_assets as (
    select
      miy.month,
      coalesce(sum(
        case
          when i.currency = base.code then i.total_cost
          else i.total_cost * coalesce(public.latest_fx_rate(current_date, i.currency, base.code), 1)
        end
      ), 0)::numeric as assets
    from months_in_year miy
    cross join base
    left join public.investments i
      on i.user_id = auth.uid()
     and (
       extract(year from i.purchase_date) < p_year
       or (
         extract(year from i.purchase_date) = p_year
         and extract(month from i.purchase_date) <= miy.month
       )
     )
    group by miy.month
  ),
  liability_items as (
    select i.id, i.currency
    from public.nw_items i
    where i.user_id = auth.uid()
      and i.side = 'liability'
  ),
  liability_snapshots as (
    select
      miy.month,
      li.id as item_id,
      (
        select case
          when li.currency = base.code then ns.amount
          else coalesce(
            ns.amount * public.latest_fx_rate(current_date, li.currency, base.code),
            ns.amount_base,
            ns.amount
          )
        end
        from public.nw_snapshots ns
        cross join base
        where ns.nw_item_id = li.id
          and ns.year = p_year
          and ns.month <= miy.month
        order by ns.month desc
        limit 1
      ) as value_base
    from months_in_year miy
    cross join liability_items li
  ),
  liabilities as (
    select month, coalesce(sum(value_base), 0)::numeric as liabilities
    from liability_snapshots
    group by month
  )
  select
    miy.month,
    (coalesce(ca.assets, 0) + coalesce(ia.assets, 0))::numeric as assets,
    coalesce(l.liabilities, 0)::numeric as liabilities,
    (coalesce(ca.assets, 0) + coalesce(ia.assets, 0) - coalesce(l.liabilities, 0))::numeric as net_worth
  from months_in_year miy
  left join cash_assets ca on ca.month = miy.month
  left join investment_assets ia on ia.month = miy.month
  left join liabilities l on l.month = miy.month
  order by miy.month;
$$;
