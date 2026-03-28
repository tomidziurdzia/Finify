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
  opening_assets as (
    select
      ob.month_id,
      sum(ob.opening_base_amount)::numeric as assets
    from public.opening_balances ob
    join months_in_year miy on miy.id = ob.month_id
    group by ob.month_id
  ),
  transaction_assets as (
    select
      t.month_id,
      sum(ta.base_amount)::numeric as assets
    from public.transactions t
    join public.transaction_amounts ta on ta.transaction_id = t.id
    join months_in_year miy on miy.id = t.month_id
    where t.user_id = auth.uid()
      and t.deleted_at is null
    group by t.month_id
  ),
  cash_assets as (
    select
      miy.month,
      coalesce(oa.assets, 0) + coalesce(ta.assets, 0) as assets
    from months_in_year miy
    left join opening_assets oa on oa.month_id = miy.id
    left join transaction_assets ta on ta.month_id = miy.id
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
