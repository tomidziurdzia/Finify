-- ============================================================
-- TRIGGER: Seed data on new user creation
-- Creates user_preferences + 6 system budget categories
-- ============================================================
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 1. Create user preferences with EUR as default base currency
  insert into user_preferences (user_id, base_currency, fx_source)
  values (new.id, 'EUR', 'frankfurter');

  -- 2. Seed the 6 system budget categories
  insert into budget_categories (user_id, category_type, name, display_order, is_system)
  values
    (new.id, 'income',                 'Ingresos',              1, true),
    (new.id, 'essential_expenses',     'Gastos Esenciales',     2, true),
    (new.id, 'discretionary_expenses', 'Gastos Discrecionales', 3, true),
    (new.id, 'debt_payments',          'Pago de Deudas',        4, true),
    (new.id, 'savings',                'Ahorros',               5, true),
    (new.id, 'investments',            'Inversiones',           6, true);

  return new;
end;
$$;

-- Drop trigger if it already exists (safe for re-runs)
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
