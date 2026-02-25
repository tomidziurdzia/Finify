# Finify — PRD, modelo de datos y plan de implementación

Convertir la planilla “Presupuesto + Patrimonio Neto 2026” en app web (luego opcional mobile), con multi-moneda, cuentas y transferencias.

---

## 1. PRD / MVP

### 1.1 Alcance y supuestos

- **Usuario:** single-user (un usuario por instancia; RLS por `user_id`).
- **Moneda base:** configurable por usuario; por defecto USD. Toda la consolidación y reportes en moneda base; cada cuenta muestra también su moneda propia.
- **Cuentas:** una moneda principal por cuenta; no se modelan sub-balances por moneda dentro de una misma cuenta (cada “moneda en Wise” = una cuenta con esa moneda).
- **Transferencias:** tipo de movimiento que afecta 2 cuentas; no cuenta como ingreso/gasto en presupuesto; soporta FX con cotización automática + override manual y trazabilidad.
- **Cierre de mes:** se congelan cotizaciones usadas para conversión a moneda base. No hay rollover de presupuesto: cada mes empieza con los **saldos de las cuentas** al cierre del mes anterior (saldo running = suma de transacciones de la cuenta hasta esa fecha).
- **Patrimonio neto:** snapshots mensuales de activos/pasivos por ítem; net worth y variación nominal/%.

### 1.2 Pantallas y flujos

| Pantalla | Descripción | Flujos principales |
|----------|-------------|---------------------|
| **Login / Auth** | Email + contraseña (ya existe) | Login → `/`; sin sesión → `/auth/login`. |
| **Dashboard (home)** | Resumen del mes actual o año | Tarjetas: remanente mes, ahorro/inversión, net worth reciente. Links a Presupuesto, Cuentas, Patrimonio. |
| **Cuentas** | CRUD cuentas (ya existe) | Lista + crear/editar/eliminar. Moneda principal por cuenta. |
| **Presupuesto (año)** | Config del año: categorías y subcategorías con montos | Selección de año; editar subcategorías y montos estimados; “Ver ajustes” (marca cambios vs base). |
| **Mes (Enero…Diciembre)** | Transacciones del mes + estimado vs real | Tabla transacciones (TanStack Table): subcategoría, fecha, monto, cuenta, nota. Totales por categoría (estimado vs real), distribución %, tasa ahorro/inversión, remanente del mes. Saldo inicial del mes = saldo de cierre del mes anterior por cuenta. |
| **Transferencias** | Crear/editar transferencia entre cuentas | Origen/destino (cuentas), montos, FX automático + override, fees opcionales. Doble partida guardada. |
| **Dashboard anual** | Consolidado 12 meses | Tablas tipo pivot, gráficos (Recharts): tendencias, comparativa estimado/real, ahorro/inversión. Vista en moneda base (y opcional por moneda). |
| **Patrimonio neto** | Activos y pasivos por ítem + snapshots | Por mes: ítems con valor; totales activos/pasivos, net worth, cambio vs mes anterior. Gráficos evolución. |
| **Configuración** | Moneda base, preferencias, FX | Moneda base; fuente de cotizaciones; opcional tema claro/oscuro. |

### 1.3 Reglas de negocio y cálculos

- **Presupuesto base-cero:** suma de (Ingresos − Gastos esenciales − Gastos discrecionales − Pago deudas − Ahorros − Inversiones) = 0 a nivel diseño; el “remanente” es el resultado de estimado vs real.
- **Real por categoría:** suma de transacciones del mes cuya subcategoría pertenece a esa categoría. Solo transacciones de tipo gasto/ingreso/ahorro/inversión/deuda; **no** transferencias.
- **Remanente del mes:** `Ingresos_real − (Gastos_esenciales + Gastos_discr + Pago_deudas + Ahorros + Inversiones)_real`, todo en moneda base usando cotización del mes (o del cierre si está cerrado). Es solo indicador del mes; no se arrastra al siguiente.
- **Saldos de cuentas:** el saldo de una cuenta a una fecha = suma de todas las transacciones de esa cuenta hasta esa fecha (incluidas transferencias in/out). Cada mes “empieza” con el saldo de cierre del mes anterior (no hay rollover de presupuesto; la continuidad es por saldos de cuentas).
- **Transferencias:** no impactan presupuesto; generan 2 movimientos (salida cuenta origen, entrada cuenta destino) enlazados; pueden tener fee (registrado como gasto o costo separado, configurable).
- **Cierre de mes:** al cerrar, se guardan en `fx_rates` (o tabla equivalente) las cotizaciones usadas para ese mes hacia moneda base; los reportes históricos usan esas cotizaciones congeladas.
- **Patrimonio neto:** snapshot por ítem (activo/pasivo) por mes; net worth = suma activos − suma pasivos en moneda base; variación nominal y % vs mes anterior.

---

## 2. Modelo de datos (ERD + Postgres / Supabase)

### 2.1 Entidades principales

- **users** (auth.users) — ya existe.
- **user_preferences** — moneda base, fuente FX, opciones.
- **currencies** — catálogo (ya en 0001).
- **accounts** — cuentas por usuario, moneda principal (ya en 0001).
- **budget_years** — año presupuestario (ej. 2026).
- **budget_categories** — 6 categorías fijas (ingresos, gastos esenciales, etc.).
- **budget_subcategories** — subcategorías por categoría, con monto estimado mensual.
- **budget_month_overrides** — ajustes por mes (opcional; para “ver ajustes” de estimado por subcategoría en un mes dado).
- **transactions** — movimientos: subcategoría, fecha, monto, cuenta, moneda, tipo (gasto/ingreso/transfer_out/transfer_in), nota; opcionalmente `transfer_id` para vincular las 2 patas de una transferencia.
- **transfers** — cabecera de transferencia: cuenta_origen, cuenta_destino, monto_origen, moneda_origen, monto_destino, moneda_destino, fx_rate, fx_source, fx_manual, fee_amount, fee_currency; dos filas en `transactions` referencian esta transfer (o se usa `transfer_pair_id` entre las dos filas).
- **fx_rates** — cotizaciones: par (from_currency, to_currency), rate, date (o month_id para cierre), source, is_manual.
- **nw_items** — ítems de patrimonio (nombre, tipo activo/pasivo, cuenta opcional).
- **nw_snapshots** — valor por ítem por mes; opcionalmente valor en moneda ítem + valor en moneda base.

### 2.2 Esquema SQL (Supabase) — migraciones adicionales

La migración **0001_accounts** ya define: `currencies`, `accounts`, RLS, trigger `updated_at`.  
A continuación: tablas que faltan (presupuesto, transacciones, transferencias, FX, patrimonio).  
**Nota:** si en 0001_accounts.sql siguen las líneas que hacen `DROP CONSTRAINT accounts_user_id_name_key` y `ADD CONSTRAINT accounts_user_id_name_currency_key`, eliminarlas (el UNIQUE ya está en el CREATE TABLE).

#### 2.2.1 Enums

```sql
CREATE TYPE public.budget_category_type AS ENUM (
  'income',
  'essential_expenses',
  'discretionary_expenses',
  'debt_payments',
  'savings',
  'investments'
);

CREATE TYPE public.transaction_type AS ENUM (
  'income',
  'expense',
  'savings',
  'investment',
  'debt_payment',
  'transfer_out',
  'transfer_in'
);

CREATE TYPE public.nw_item_side AS ENUM ('asset', 'liability');
```

#### 2.2.2 user_preferences

```sql
CREATE TABLE public.user_preferences (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  base_currency TEXT NOT NULL REFERENCES public.currencies(code),
  fx_source     TEXT NOT NULL DEFAULT 'frankfurter',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own preferences"
  ON public.user_preferences FOR ALL USING (auth.uid() = user_id);
```

#### 2.2.3 Presupuesto (año, categorías, subcategorías, overrides)

```sql
CREATE TABLE public.budget_years (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year       INTEGER NOT NULL,
  UNIQUE(user_id, year)
);

CREATE TABLE public.budget_categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_type public.budget_category_type NOT NULL,
  name          TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_system     BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(user_id, category_type)
);

CREATE TABLE public.budget_subcategories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id  UUID NOT NULL REFERENCES public.budget_categories(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  monthly_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(category_id, name)
);

CREATE TABLE public.budget_month_overrides (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subcategory_id  UUID NOT NULL REFERENCES public.budget_subcategories(id) ON DELETE CASCADE,
  year            INTEGER NOT NULL,
  month           INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  amount          NUMERIC(18,4) NOT NULL,
  UNIQUE(subcategory_id, year, month)
);

CREATE INDEX idx_budget_years_user ON public.budget_years(user_id);
CREATE INDEX idx_budget_subcategories_category ON public.budget_subcategories(category_id);
CREATE INDEX idx_budget_month_overrides_sub ON public.budget_month_overrides(subcategory_id);
```

RLS: todas por `user_id` (a través de `budget_years` o `budget_categories`). Omitido aquí por brevedad; patrón igual que `accounts`.

#### 2.2.4 Transacciones y transferencias

```sql
CREATE TABLE public.transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id       UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  subcategory_id   UUID REFERENCES public.budget_subcategories(id) ON DELETE SET NULL,
  transaction_type public.transaction_type NOT NULL,
  date             DATE NOT NULL,
  amount           NUMERIC(18,4) NOT NULL,
  currency         TEXT NOT NULL REFERENCES public.currencies(code),
  note             TEXT,
  transfer_id      UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.transfers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_from_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  account_to_id   UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  amount_from     NUMERIC(18,4) NOT NULL,
  currency_from  TEXT NOT NULL REFERENCES public.currencies(code),
  amount_to       NUMERIC(18,4) NOT NULL,
  currency_to     TEXT NOT NULL REFERENCES public.currencies(code),
  fx_rate         NUMERIC(18,8),
  fx_source       TEXT,
  fx_manual       BOOLEAN NOT NULL DEFAULT false,
  fx_at           TIMESTAMPTZ,
  fee_amount      NUMERIC(18,4),
  fee_currency    TEXT REFERENCES public.currencies(code),
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transactions
  ADD CONSTRAINT fk_transfer FOREIGN KEY (transfer_id) REFERENCES public.transfers(id) ON DELETE SET NULL;

CREATE INDEX idx_transactions_user_date ON public.transactions(user_id, date);
CREATE INDEX idx_transactions_account ON public.transactions(account_id);
CREATE INDEX idx_transactions_subcategory ON public.transactions(subcategory_id);
CREATE INDEX idx_transfers_user ON public.transfers(user_id);
```

- **Doble partida:** al crear una transferencia se inserta 1 fila en `transfers` y 2 en `transactions`: una `transfer_out` (cuenta origen, amount negativo en su moneda) y una `transfer_in` (cuenta destino, amount positivo en su moneda); ambas con el mismo `transfer_id`.
- **Fee:** se puede registrar en `transfers`; si se desea que cuente como gasto del presupuesto, se puede crear además una transacción de tipo `expense` ligada a la misma operación (o tratarse como “costo de transferencia” fuera del presupuesto; decidir en UX).

#### 2.2.5 FX (cotizaciones y cierre)

```sql
CREATE TABLE public.fx_rates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_currency TEXT NOT NULL REFERENCES public.currencies(code),
  to_currency   TEXT NOT NULL REFERENCES public.currencies(code),
  rate         NUMERIC(18,8) NOT NULL,
  rate_date    DATE NOT NULL,
  source       TEXT NOT NULL,
  is_manual    BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, from_currency, to_currency, rate_date)
);

CREATE INDEX idx_fx_rates_user_date ON public.fx_rates(user_id, rate_date);
```

- **Uso:** al mostrar saldos/reportes en moneda base se busca `rate_date <= fecha` (o mes de cierre). Al cerrar mes se insertan las filas necesarias para ese mes. Override manual = `is_manual = true` y `source` fijo (ej. 'manual').

#### 2.2.6 Patrimonio neto

```sql
CREATE TABLE public.nw_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  side       public.nw_item_side NOT NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  currency   TEXT NOT NULL REFERENCES public.currencies(code),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

CREATE INDEX idx_nw_items_user ON public.nw_items(user_id);
CREATE INDEX idx_nw_snapshots_item ON public.nw_snapshots(nw_item_id);
```

- **Vista mensual:** agregar por (year, month) suma de `amount_base` por side (asset/liability); net worth = activos − pasivos; variación vs (year, month-1) o mes anterior.

### 2.3 ERD resumido

```
auth.users
  ├── user_preferences (base_currency, fx_source)
  ├── accounts (name, account_type, currency)
  ├── budget_years (year)
  │     └── budget_categories (category_type, name)
  │           └── budget_subcategories (name, monthly_amount)
  │                 └── budget_month_overrides (year, month, amount)
  ├── transactions (account, subcategory, type, date, amount, currency, transfer_id)
  ├── transfers (account_from, account_to, amounts, fx_*, fee_*)
  ├── fx_rates (from_currency, to_currency, rate, rate_date, is_manual)
  ├── nw_items (name, side, account?, currency)
  │     └── nw_snapshots (year, month, amount, amount_base)
  └── currencies (code, symbol, ...) [referencia global]
```

---

## 3. Endpoints / Server Actions y estructura del proyecto

### 3.1 Stack (ya alineado con Finify)

- **Next.js** (App Router), **TypeScript**, **Tailwind**, **shadcn/ui**, **Supabase** (Auth + Postgres), **Recharts**.
- **Server Actions** para mutaciones y lecturas (sin API routes REST salvo auth).
- **TanStack Query** en cliente; `queryFn`/`mutationFn` llaman a las Server Actions.
- **TanStack Table** para la lista de transacciones (orden, filtros, paginación).

### 3.2 Estructura de carpetas sugerida

```
src/
├── app/
│   ├── (auth)/auth/login, confirm, logout, error, sign-up-success
│   └── (dashboard)/
│       ├── page.tsx                 # Dashboard home
│       ├── accounts/                 # Ya existe
│       ├── budget/                   # Presupuesto año
│       ├── month/[year]/[month]/     # Mes (transacciones)
│       ├── transfers/                # Lista + crear/editar
│       ├── dashboard-annual/        # Dashboard anual
│       ├── net-worth/                # Patrimonio
│       └── settings/                # Config (moneda base, etc.)
├── actions/
│   ├── accounts.ts                  # Ya existe
│   ├── budget.ts                    # getYears, getCategories, getSubcategories, upsertOverrides
│   ├── transactions.ts              # listByMonth, create, update, delete
│   ├── transfers.ts                 # create (doble partida + FX), list, getFx
│   ├── fx.ts                        # getRate, saveRate (manual), getRatesForMonth
│   ├── months.ts                    # closeMonth (freeze FX)
│   ├── dashboard.ts                 # annual aggregates, pivot data
│   ├── net-worth.ts                 # getItems, getSnapshots, upsertSnapshot
│   └── user-preferences.ts          # get, setBaseCurrency, setFxSource
├── hooks/
│   ├── useAccounts.ts               # Ya existe
│   ├── useBudget.ts
│   ├── useTransactions.ts
│   ├── useTransfers.ts
│   ├── useFx.ts
│   └── useNetWorth.ts
├── components/
│   ├── app-sidebar.tsx              # Ya existe
│   ├── auth/
│   ├── ui/                          # shadcn
│   ├── budget/
│   ├── transactions/
│   ├── transfers/
│   └── net-worth/
├── lib/
│   ├── supabase/
│   ├── validations/
│   └── fx-client.ts                 # Llamada a API externa FX
└── types/
    ├── accounts.ts                  # Ya existe
    ├── budget.ts
    ├── transactions.ts
    └── net-worth.ts
```

### 3.3 Funciones principales por dominio

| Dominio | Acciones |
|---------|----------|
| **Presupuesto** | `getBudgetYears`, `getBudgetCategories`, `getSubcategories(categoryId)`, `upsertSubcategory`, `getMonthOverrides(year, month)`, `upsertMonthOverride` |
| **Transacciones** | `getTransactions(year, month)`, `createTransaction`, `updateTransaction`, `deleteTransaction` (y validar que no rompa transferencias) |
| **Transferencias** | `createTransfer` (obtener FX, opcional override, crear `transfers` + 2 `transactions`), `getTransfers`, `getTransfer(id)` |
| **FX** | `getFxRate(from, to, date?)`, `saveManualRate(from, to, date, rate)`, `getRatesForMonth(year, month)` para cierre |
| **Cierre de mes** | `closeMonth(userId, year, month)` (persistir FX del mes). Saldos por cuenta = suma de transacciones hasta esa fecha; no hay rollover de presupuesto. |
| **Dashboard anual** | `getAnnualSummary(year)`, `getMonthlyComparison(year)` (estimado vs real por mes) |
| **Patrimonio** | `getNwItems`, `getSnapshots(year, month)`, `upsertNwSnapshot(itemId, year, month, amount, amountBase)` |
| **User preferences** | `getUserPreferences`, `updateBaseCurrency`, `updateFxSource` |

---

## 4. Plan de implementación por etapas

### Etapa 0 — Hecha

- Next.js, Auth (email/password), Sidebar, Cuentas CRUD, `currencies`, `accounts`.

### Etapa 1 — MVP Core (presupuesto + transacciones sin FX avanzado)

1. **Migraciones:** `user_preferences`, `budget_years`, `budget_categories`, `budget_subcategories`, `budget_month_overrides`, `transactions` (sin `transfers` ni `transfer_id` aún si se quiere simplificar).
2. **Seed:** al crear usuario, insertar `user_preferences` (base_currency USD) y las 6 `budget_categories` con nombres en español.
3. **Pantallas:** Presupuesto (año) — editar subcategorías y montos; Mes [year]/[month] — lista de transacciones (TanStack Table), formulario alta/edición, totales estimado vs real, remanente. Todo en moneda de la transacción o moneda base simple (sin cierre congelado aún).
4. **Saldos:** saldo por cuenta al inicio de un mes = suma de transacciones de esa cuenta hasta el último día del mes anterior (sin rollover de presupuesto).

### Etapa 2 — Multi-moneda y transferencias

1. **Migraciones:** `transfers`, `fx_rates`; en `transactions` agregar `transfer_id` y tipos `transfer_out`/`transfer_in`.
2. **FX:** cliente para API (ej. Frankfurter) en `lib/fx-client.ts`; `getFxRate(from, to, date)` con cache en memoria o en `fx_rates` por día.
3. **Transferencias:** UI crear transferencia (origen, destino, monto, FX automático + override manual); guardar en `transfers` y 2 filas en `transactions`; fees opcionales.
4. **Reportes:** convertir a moneda base usando `fx_rates` (por fecha o por mes cerrado).

### Etapa 3 — Cierre de mes (sin rollover de presupuesto)

1. **Cierre:** acción “Cerrar mes” que persiste en `fx_rates` las cotizaciones usadas para ese mes (por par necesario).
2. **Saldos:** cada mes empieza con el saldo de cierre del mes anterior por cuenta (saldo running = suma de transacciones de la cuenta hasta esa fecha; no hay concepto de “arrastrar remanente” de presupuesto).
3. **Vistas históricas:** siempre usar `fx_rates` del mes cerrado cuando exista.

### Etapa 4 — Dashboard anual y Patrimonio neto

1. **Dashboard anual:** agregados por mes, gráficos Recharts, tablas pivot; vista en moneda base.
2. **Patrimonio:** `nw_items`, `nw_snapshots`; pantalla por mes con totales y gráficos; variación nominal y %.

### Etapa 5 — Import desde Sheet y mejoras

1. **Import:** script o pantalla que lea CSV (exportado del Sheet): categorías, subcategorías, montos, transacciones por mes; mapear a `budget_*` y `transactions` (con validación y opción de dry-run).
2. **Mejoras:** “Ver ajustes” (marcar subcategorías con override vs base), fees de transferencia como gasto opcional, tema claro/oscuro.

---

## 5. Cotizaciones (FX + precios), cache y override manual

### 5.1 API(s) recomendadas

- **Fiat:** [Frankfurter](https://www.frankfurter.app/) (gratuita, sin key; pares EUR, USD, etc.). Alternativa: ExchangeRate-API (con key).
- **Crypto:** CoinGecko o similar (precios ETH, BTC, etc. en USD).
- **ETFs/acciones:** precios manuales o API de Yahoo Finance / Alpha Vantage (con key). Para MVP se puede dejar solo entrada manual de “precio” por ítem/activo si aplica.

**Supuesto:** FX fiat vía Frankfurter; crypto/ETF en v2 o manual.

### 5.2 Estrategia de cache y versionado

- **Cache:** en tabla `fx_rates`: por (user_id, from_currency, to_currency, rate_date). Al pedir un rate:
  1. Buscar en `fx_rates` para esa fecha (o la más reciente anterior).
  2. Si no hay o está expirado (ej. mismo día para “hoy”), llamar a la API, guardar en `fx_rates` con `source = 'frankfurter'`, `is_manual = false`.
- **Cierre de mes:** al cerrar, para cada par usado en ese mes escribir/actualizar en `fx_rates` con `rate_date = último día del mes`, de modo que el histórico no cambie.
- **Override manual:** al guardar una transferencia (o una cotización manual en configuración), insertar/actualizar en `fx_rates` con `is_manual = true`, `source = 'manual'`. Esa fila tiene prioridad para esa fecha en reportes. Trazabilidad: queda guardado en la fila quién/cuándo y el valor.

### 5.3 Trazabilidad

- En `transfers`: `fx_rate`, `fx_source`, `fx_manual`, `fx_at`.
- En `fx_rates`: `source`, `is_manual`, `created_at`.
- Los reportes que convierten a moneda base pueden usar siempre la misma lógica: “para (from, to, date) tomar la fila de fx_rates con rate_date <= date más reciente, priorizando is_manual si hay empate” (o prioridad explícita: manual > API para esa fecha).

---

## 6. Resumen de supuestos explícitos

1. Un usuario por tenant; RLS con `auth.uid()`.
2. Una cuenta = una moneda principal; múltiples monedas = múltiples cuentas.
3. Transferencias: doble partida en `transactions` ligada por `transfer_id`; no cuentan en presupuesto.
4. Sin rollover de presupuesto: cada mes empieza con los saldos de las cuentas al cierre del mes anterior (continuidad por saldos, no por remanente).
5. Cierre de mes: congela FX en `fx_rates` para ese mes; reportes históricos usan esas cotizaciones.
6. Fee de transferencia: guardado en `transfers`; si se considera gasto del presupuesto, se puede modelar como transacción adicional (o no, según producto).
7. Patrimonio: ítems con snapshots mensuales; net worth = activos − pasivos en moneda base.
8. Import desde Sheet: vía CSV; mapeo a categorías/subcategorías y transacciones; sin historial de FX del Sheet (se usan rates actuales o manuales para fechas pasadas si se importa histórico).

Si querés, el siguiente paso puede ser bajar esto a **una migración SQL concreta 0002_*.sql** (presupuesto + transacciones) y los **actions/hooks mínimos** para la Etapa 1.
