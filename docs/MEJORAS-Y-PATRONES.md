# Mejoras y Patrones para Finify

Análisis y propuesta de patrones a incorporar, extraídos de dos proyectos de referencia:

- **JouveERP** (`../JouveERP`) — ERP en Next.js 16 + Supabase + TanStack Query. Foco en patrones de arquitectura: actions, RBAC, RPCs, realtime, observability, audit, RSC + hydration.
- **Proyecto de referencia "R"** (en adelante "el proyecto R", no nombrado) — Plataforma empresarial con agentes de IA, embeddings, MCP, workflows duraderos y SSE. Foco en cómo agregar **IA agéntica** a una app financiera.

> ⚠️ **Restricción crítica**: la base de datos productiva ya tiene información sensible. Cualquier cambio de schema debe planearse con migraciones reversibles y verificarse en una rama Supabase antes de aplicar a `main`. Esto está marcado explícitamente en cada sección que toque DB con la etiqueta **🔒 DB**.

---

## Tabla de contenidos

1. [Estado actual de Finify (resumen rápido)](#1-estado-actual-de-finify)
2. [Patrón #1 — Query layer (TanStack Query)](#2-patrón-1--query-layer-tanstack-query)
3. [Patrón #2 — Server Actions con envelope `ActionResult`](#3-patrón-2--server-actions-con-envelope-actionresult)
4. [Patrón #3 — Estructura por features](#4-patrón-3--estructura-por-features)
5. [Patrón #4 — Providers y root layout](#5-patrón-4--providers-y-root-layout)
6. [Patrón #5 — Supabase: clients, RPCs, RLS, tipos](#6-patrón-5--supabase-clients-rpcs-rls-tipos)
7. [Patrón #6 — Auth context cacheado + RBAC](#7-patrón-6--auth-context-cacheado--rbac)
8. [Patrón #7 — Audit log + soft delete](#8-patrón-7--audit-log--soft-delete)
9. [Patrón #8 — Realtime: invalidación de queries](#9-patrón-8--realtime-invalidación-de-queries)
10. [Patrón #9 — Hooks utilitarios reutilizables](#10-patrón-9--hooks-utilitarios-reutilizables)
11. [Patrón #10 — Validación con Zod compartida client/server](#11-patrón-10--validación-con-zod-compartida-clientserver)
12. [Patrón #11 — Tablas con TanStack Table](#12-patrón-11--tablas-con-tanstack-table)
13. [Patrón #12 — Testing (Vitest + Playwright)](#13-patrón-12--testing-vitest--playwright)
14. [Patrón #13 — Observabilidad (Sentry + logger estructurado)](#14-patrón-13--observabilidad-sentry--logger-estructurado)
15. [Patrón #14 — Jobs/Background con Inngest](#15-patrón-14--jobsbackground-con-inngest)
16. [Patrón #15 — Seguridad: CSP, rate limit, service role](#16-patrón-15--seguridad-csp-rate-limit-service-role)
17. [**🤖 IA — Diseño completo para Finify**](#17--ia--diseño-completo-para-finify)
18. [**🤖 IA — Features concretas inspiradas en el proyecto R**](#18--ia--features-concretas-inspiradas-en-el-proyecto-r)
19. [Plan de adopción priorizado](#19-plan-de-adopción-priorizado)

---

## 1. Estado actual de Finify

| Capa | Estado | Notas |
|---|---|---|
| Next.js | 16.1.6 + App Router | ✅ Alineado con JouveERP |
| React | 19.2.4 | ✅ |
| TypeScript | 5.9.3 strict | ✅ |
| TanStack Query | 5.90.21 | ✅ Configurado, pero **no se usa SSR/hydration**, ni `useSuspenseQuery`, ni un wrapper `runAction()` |
| Supabase | `@supabase/ssr` 0.8.0 | ✅ Clients OK, ya hay 2 RPCs (`usage_counts`, `transactions_feed`) |
| Server Actions | Existen, envelope `{data}\|{error}` | ⚠️ El envelope es discriminado por la **presencia** de `error`. JouveERP usa `{ ok: true, data }\|{ ok: false, error }` (más explícito) |
| `database.types.ts` | **Comentado/no usado** | ⚠️ Pendiente correr `supabase gen types` |
| RLS | Aplicado por `user_id` | ✅ |
| Forms | react-hook-form + Zod 4 | ✅ |
| Tests | **Ninguno** | ❌ Falta Vitest + Playwright |
| Observability | **Ninguna** | ❌ Falta Sentry y logger estructurado |
| Audit log | **No** | ❌ |
| Realtime | **No** | ❌ |
| RBAC | **No** (single-user) | ✅ Aceptable para finanzas personales |
| Background jobs | **No** | ❌ FX/precios se piden on-demand |
| IA | **No existe** | ❌ Objetivo principal de este doc |

---

## 2. Patrón #1 — Query layer (TanStack Query)

Tu `QueryProvider` actual instancia el client de forma correcta pero no comparte la config con el server. En JouveERP la pieza clave es un **factory único** consumido por ambos lados:

### 2.1 Factory compartido client + server

```ts
// src/lib/query/query-client.ts
import { QueryClient } from "@tanstack/react-query";

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}
```

```ts
// src/components/providers/query-provider.tsx
"use client";
import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { makeQueryClient } from "@/lib/query/query-client";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => makeQueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

> **Por qué importa**: si el server prefetch usa una config distinta a la del cliente, los datos dehidratados pueden re-fetchearse al montar → "flash" de loaders y trabajo desperdiciado. Un solo factory elimina el drift.

### 2.2 Prefetch en RSC + hydration

```ts
// src/lib/query/prefetch.ts
import { dehydrate, type FetchQueryOptions } from "@tanstack/react-query";
import { makeQueryClient } from "./query-client";

export async function prefetchQueries(queries: FetchQueryOptions[]) {
  const qc = makeQueryClient();
  await Promise.all(
    queries.map((q) =>
      qc.prefetchQuery(q).catch((err) => {
        if (process.env.NODE_ENV !== "production")
          console.error("prefetch failed", { key: q.queryKey, err });
      }),
    ),
  );
  return dehydrate(qc);
}
```

```tsx
// src/lib/query/hydrate.tsx
import { HydrationBoundary, type DehydratedState } from "@tanstack/react-query";
export function Hydrate({ state, children }: { state: DehydratedState; children: React.ReactNode }) {
  return <HydrationBoundary state={state}>{children}</HydrationBoundary>;
}
```

Uso en una página RSC (por ejemplo `app/(dashboard)/transactions/page.tsx`):

```tsx
import { Hydrate } from "@/lib/query/hydrate";
import { prefetchQueries } from "@/lib/query/prefetch";
import { transactionsKeys } from "@/features/transactions/lib/keys";
import { listTransactionsAction } from "@/features/transactions/actions";
import { runAction } from "@/lib/query/run-action";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string,string>> }) {
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const state = await prefetchQueries([
    {
      queryKey: transactionsKeys.list(filters),
      queryFn: () => runAction(() => listTransactionsAction(filters)),
    },
  ]);
  return (
    <Hydrate state={state}>
      <TransactionsClient filters={filters} />
    </Hydrate>
  );
}
```

### 2.3 `runAction()` — el wrapper que desempaqueta el envelope

```ts
// src/lib/query/run-action.ts
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function runAction<T>(fn: () => Promise<ActionResult<T>>): Promise<T> {
  await Promise.resolve(); // workaround Next.js 16: server action triggers setState en render
  const res = await fn();
  if (!res.ok) throw new Error(res.error);
  return res.data;
}
```

> Pequeño detalle, gran impacto: el `await Promise.resolve()` evita conflictos con `useSuspenseQuery` cuando un server action dispara router updates durante render. Sin esto, ves errores raros tipo "cannot update during render".

### 2.4 `useSuspenseQuery` + paginación infinita

En `useTransactionsList`, usar **`useSuspenseInfiniteQuery`** para listas paginadas (ya hay endpoint paginado en `actions/transactions.ts` con `transactions_feed`):

```ts
export function useTransactionsFeed(filters: TransactionFilters) {
  const query = useSuspenseInfiniteQuery({
    queryKey: transactionsKeys.feed(filters),
    queryFn: ({ pageParam }) =>
      runAction(() => listTransactionsAction({ ...filters, offset: pageParam, limit: PAGE_SIZE })),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });
  const items = useMemo(() => query.data.pages.flatMap((p) => p.items), [query.data]);
  return { ...query, items };
}
```

> **Por qué**: `useSuspenseInfiniteQuery` se integra con `<Suspense>` (ya estás usando Suspense en el dashboard) y elimina el chequeo manual de `isLoading`. La lista se hidrata desde el RSC sin parpadeo.

### 2.5 Query keys como factory tipado

Ya tenés esto parcialmente en `useTransactions.ts` (`TRANSACTION_KEYS`). Movelo a `features/<feature>/lib/keys.ts` para mantener consistencia con la estructura propuesta más abajo:

```ts
// src/features/transactions/lib/keys.ts
export const transactionsKeys = {
  all: ["transactions"] as const,
  list: (monthId: string) => [...transactionsKeys.all, "month", monthId] as const,
  feed: (monthId: string, filters: TransactionFilters) =>
    [...transactionsKeys.all, "feed", monthId, filters] as const,
  byId: (id: string) => [...transactionsKeys.all, "byId", id] as const,
};
```

### 2.6 Invalidación con tags compuestos

Tu `invalidateFinancialQueries` actual (en `useTransactions.ts`) invalida una lista hardcodeada de keys. Reemplazalo por una **función de dominio** por feature, y exporta un `invalidateDashboardSnapshot()` que cada mutación llama. Mantiene la cadena de invalidaciones declarativa.

---

## 3. Patrón #2 — Server Actions con envelope `ActionResult`

### 3.1 Envelope discriminado por `ok`

Tu envelope actual:

```ts
type ActionResult<T> = { data: T } | { error: string };
```

Es funcional pero implícito. JouveERP usa:

```ts
type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };
```

Ventajas:
- TypeScript estrecha por `res.ok` (más legible que `"error" in res`).
- Permite agregar campos en cada rama sin ambigüedad (`{ ok: true, data, meta }` vs `{ ok: false, error, code }`).
- Se integra trivialmente con `runAction()` (sección 2.3).

> **Migración**: 30+ actions. Se puede hacer en una sola PR con find+replace cuidadoso. No toca DB. **No requiere migración**.

### 3.2 Patrón completo de un action

```ts
"use server";
import { requireUser } from "@/lib/auth/context";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { CreateTransactionSchema } from "@/features/transactions/schema";

export async function createTransactionAction(input: unknown): Promise<ActionResult<Transaction>> {
  const user = await requireUser();                    // throws si no auth
  const parsed = CreateTransactionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Validación falló" };
  }
  const sb = await createClient();
  const { data, error } = await sb.from("transactions").insert(parsed.data).select().single();
  if (error) {
    logger.error("transactions.create.failed", { userId: user.userId, error });
    return { ok: false, error: "No pudimos crear la transacción." };
  }
  return { ok: true, data };
}
```

Tres cosas no obvias:
1. **`requireUser()`** centraliza el chequeo de sesión y arroja si no hay user. Más simple que repetir `if (!user) return { error: ... }` en cada action.
2. **`safeParse`** retorna error **estructurado** sin throw. Usá el primer issue para el toast del usuario; loggeá el objeto entero.
3. **Mensaje al usuario ≠ mensaje al log**. Nunca devuelvas el error crudo de Postgres al cliente (puede filtrar info del schema).

---

## 4. Patrón #3 — Estructura por features

Hoy en Finify:
```
src/actions/{transactions,budget,...}.ts
src/hooks/use{Transactions,Budget,...}.ts
src/types/{transactions,budget}.ts
src/lib/validations/{transaction,budget}.schema.ts
```

Funciona, pero un cambio en "transactions" toca cuatro carpetas. JouveERP organiza por feature:

```
src/features/transactions/
  ├─ actions/transactions-actions.ts    # server actions
  ├─ components/                        # UI específica
  │   ├─ transactions-table.tsx
  │   ├─ transaction-form.tsx
  │   └─ new-transaction-dialog.tsx
  ├─ hooks/use-transactions.ts          # TanStack hooks
  ├─ lib/transactions-keys.ts           # queryKeys factory
  ├─ schema.ts                          # Zod + types
  └─ schema.test.ts                     # tests del schema
```

### Beneficios concretos

- **Coupling local, cohesion global**: todo lo de "transactions" vive junto.
- **Imports más cortos** (`from "../schema"` vs `from "@/lib/validations/transaction.schema"`).
- **PRs más legibles**: el diff toca un solo subárbol.
- **Más fácil de borrar/extraer**: si algún día deprecás "recurring", borrás la carpeta.

### Migración sugerida (sin tocar DB)

1. Crear `src/features/<dominio>/` para cada uno de: transactions, accounts, budget, investments, net-worth, recurring, savings-goals, debts, months.
2. Mover archivos uno a uno con `git mv`.
3. Mantener `src/components/ui/` (shadcn) y `src/lib/` (helpers transversales) como están.
4. Componentes compartidos entre features (combobox de cuenta, p.ej.) → `src/components/` raíz, no en una feature.

> **No requiere migración DB**. Es pura organización de filesystem.

---

## 5. Patrón #4 — Providers y root layout

`app/layout.tsx` de JouveERP es minimalista pero compone múltiples providers de forma limpia:

```tsx
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "@/components/ui/sonner";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="es-AR" suppressHydrationWarning>
      <body className="min-h-svh bg-background text-foreground antialiased">
        <ThemeProvider nonce={nonce}>
          <QueryProvider>{children}</QueryProvider>
          <Toaster richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

Tu layout actual es similar pero le falta:
- **`ThemeProvider` con `next-themes`** (ya tenés la dep pero no envuelves). Sin esto el toggle dark/light no persiste.
- **`Toaster`** con `richColors closeButton` (mejora UX de notificaciones existentes).
- **CSP nonce** propagado al ThemeProvider para que el script anti-FOUC pase tu Content-Security-Policy (ver sección 16).

### Stack recomendado para Finify

```
<ThemeProvider>           # next-themes (toggle dark/light)
  <QueryProvider>         # TanStack Query
    <TooltipProvider>     # ya lo tenés
      {children}
    </TooltipProvider>
  </QueryProvider>
  <Toaster richColors />  # sonner
</ThemeProvider>
```

Cuando agregues IA (sección 17), un `<AiCfoProvider>` se compone después de `QueryProvider`.

---

## 6. Patrón #5 — Supabase: clients, RPCs, RLS, tipos

### 6.1 Tipos generados (urgente)

Hoy `src/types/database.types.ts` está vacío con un TODO. **Corré ya**:

```bash
npx supabase gen types typescript --linked --schema public > src/types/database.types.ts
```

Y comiteá un script:
```json
"db:types:generate": "npx supabase gen types typescript --linked --schema public > src/types/database.types.ts"
```

Luego tipa los clients:
```ts
// src/lib/supabase/server.ts
import type { Database } from "@/types/database.types";
export async function createClient() {
  // ...
  return createServerClient<Database>(...);
}
```

> **🔒 DB**: Solo **lee** el schema. No modifica nada. Seguro de correr contra prod.

### 6.2 Service client (admin) separado del session client

JouveERP tiene `lib/supabase/service.ts` que crea un client con `service_role` para operaciones que **deben** evadir RLS (audit log, jobs de Inngest, mantenimiento). Usalo **solo** en server actions/route handlers, nunca lo expongas al cliente.

```ts
// src/lib/supabase/service.ts
import "server-only";
import { createClient as createSb } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

let cached: ReturnType<typeof createSb<Database>> | null = null;
export function getServiceClient() {
  if (cached) return cached;
  cached = createSb<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,   // 👈 nuevo env var
    { auth: { persistSession: false } },
  );
  return cached;
}
```

> **Setup**: agregá `SUPABASE_SERVICE_ROLE_KEY` a `.env.local` (NO commit). Disponible en Supabase Studio → API → Service Role Key. **Nunca** prefijes con `NEXT_PUBLIC_`.

### 6.3 RPCs (Postgres functions)

Ya tenés dos RPCs (`usage_counts`, `transactions_feed`). El patrón es excelente cuando:
- La query es compleja (JOINs, agregaciones, paginación con filtros opcionales).
- Querés que el plan de query lo decida Postgres una sola vez (función `STABLE` se cachea).
- Querés exponer una operación atómica que toque varias tablas (transferencia entre cuentas, p. ej.).

**Próximas RPCs candidatas** (todas son aditivas, no rompen schema existente):

| RPC | Qué hace | Uso |
|---|---|---|
| `dashboard_summary(p_month_id)` | Retorna en una llamada: totales por categoría, neto del mes, comparativa con mes anterior, top 5 gastos | Reemplaza ~6 queries del dashboard → 1 |
| `category_drilldown(p_subcategory_id, p_month_id)` | Lista transacciones + saldos acumulados de una subcategoría | Drill-down del gráfico |
| `net_worth_evolution(p_from, p_to)` | Serie mensual del patrimonio neto en base currency | Gráfico de net worth |
| `forecast_monthly(p_months_ahead)` | Proyección de balance basada en recurrentes activas + promedios | Reemplaza lógica que hoy está en `actions/forecast.ts` |

> **🔒 DB**: Crear RPC es una migración. Es **aditivo** (no toca tablas), revertible con `DROP FUNCTION`. Bajo riesgo si se prueba en una rama Supabase primero.

### 6.4 RLS auditable

Toda tabla tiene políticas, pero las migraciones no las imprimen sistemáticamente. Convención sugerida:

```sql
-- supabase/migrations/<ts>_<feature>.sql
-- AL FINAL del archivo siempre el bloque RLS
ALTER TABLE <tabla> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "<tabla>_select_own" ON <tabla>
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "<tabla>_insert_own" ON <tabla>
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "<tabla>_update_own" ON <tabla>
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "<tabla>_delete_own" ON <tabla>
  FOR DELETE USING (auth.uid() = user_id);
```

Y agregá un test de seguridad (sección 13):
```ts
test("user A no puede leer transactions de user B", async () => {
  const { data } = await sbAsUserA.from("transactions").select().eq("user_id", USER_B_ID);
  expect(data).toEqual([]);
});
```

---

## 7. Patrón #6 — Auth context cacheado + RBAC

### 7.1 `requireUserContext()` con `React.cache`

```ts
// src/lib/auth/context.ts
import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type UserContext = { userId: string; email: string };

export const getCurrentUser = cache(async (): Promise<UserContext | null> => {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  return user ? { userId: user.id, email: user.email ?? "" } : null;
});

export async function requireUser(): Promise<UserContext> {
  const u = await getCurrentUser();
  if (!u) throw new Error("Unauthenticated");
  return u;
}
```

> **Detalle clave**: `React.cache` deduplica la llamada en la **misma request**. Si tu RSC renderiza 4 layouts y cada uno necesita el user, hace **1 sola** consulta a Supabase. Sin esto, los proyectos tienden a hacer 3-5 `auth.getUser()` por request.

### 7.2 RBAC (opcional, futuro)

Finify es single-tenant single-user hoy. Si en algún momento agregás **cuentas compartidas** (pareja, contador), JouveERP tiene un patrón completo:

```ts
// src/lib/auth/permissions.ts
export const PERMISSIONS = [
  "transactions:read", "transactions:write",
  "budget:read", "budget:write",
  "investments:read", "investments:write",
  // ...
] as const;

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: PERMISSIONS,
  viewer: ["transactions:read", "budget:read", /* ... */],
  accountant: ["transactions:read", "transactions:write", "budget:read"],
};

export function userCan(roles: Role[], perm: Permission): boolean {
  return roles.some((r) => ROLE_PERMISSIONS[r].includes(perm));
}
```

Cada action chequea:
```ts
if (!userCan(ctx.roles, "transactions:write")) {
  return { ok: false, error: "No tenés permiso." };
}
```

> **🔒 DB**: Requiere tabla `user_roles` y migrar `user_id` a `account_owner_id` con `member_id` adicional. **Trabajo serio**. No urgente.

---

## 8. Patrón #7 — Audit log + soft delete

### 8.1 Audit log

Tu app maneja plata real → todo cambio crítico debería dejar rastro. JouveERP tiene:

```sql
CREATE TABLE audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  event_type text not null,            -- "transaction.created", "transaction.deleted", etc
  target_resource_id text,             -- id del recurso afectado
  payload jsonb,                       -- snapshot pre/post del cambio
  created_at timestamptz default now()
);

CREATE INDEX audit_events_actor_idx ON audit_events(actor_id, created_at desc);
CREATE INDEX audit_events_resource_idx ON audit_events(target_resource_id);

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_select_own" ON audit_events FOR SELECT USING (auth.uid() = actor_id);
-- INSERT solo via service_role (sin policy = bloqueado para anon)
```

Y en cada action de mutación:
```ts
await logAudit("transaction.created", user.userId, { transaction: data }, data.id);
```

> **🔒 DB**: Una migración aditiva nueva. No toca tablas existentes. **Bajo riesgo**, **alta utilidad** (forensic, debugging, "qué pasó con esto").

### 8.2 Soft delete

Ya lo tenés en `transactions` (`deleted_at`). Replicalo en otras tablas críticas:
- `accounts` (no querés perder históricos al "borrar" una cuenta)
- `investments`
- `recurring_transactions`

> **🔒 DB**: Agregar columna `deleted_at timestamptz null` es **no breaking** (default null, queries existentes siguen funcionando). Las queries deben filtrar `.is("deleted_at", null)` — agregalo a la convención.

---

## 9. Patrón #8 — Realtime: invalidación de queries

JouveERP tiene un hook muy elegante que escucha `postgres_changes` de Supabase y **solo** invalida las queries afectadas (no hace fetch directo, deja que TanStack maneje):

```ts
// src/hooks/use-realtime-invalidate.ts
"use client";
import { useEffect, useRef } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

type Subscription = {
  table: string;
  schema?: string;
  filter?: string;          // ej: "user_id=eq.<uuid>"
  queryKeys: QueryKey[];
};

export function useRealtimeInvalidate(subs: Subscription[]) {
  const qc = useQueryClient();
  const subsRef = useRef(subs);
  subsRef.current = subs;

  const signature = subs.map((s) => `${s.schema ?? "public"}.${s.table}:${s.filter ?? ""}`).sort().join("|");

  useEffect(() => {
    if (subsRef.current.length === 0) return;
    const sb = createClient();
    const channel = sb.channel(`realtime:${signature}`);
    subsRef.current.forEach((sub, i) => {
      channel.on("postgres_changes" as never, {
        event: "*",
        schema: sub.schema ?? "public",
        table: sub.table,
        ...(sub.filter ? { filter: sub.filter } : {}),
      }, () => {
        subsRef.current[i]?.queryKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      });
    });
    channel.subscribe();
    return () => { sb.removeChannel(channel); };
  }, [signature, qc]);
}
```

Uso en una página:
```ts
useRealtimeInvalidate([
  { table: "transactions", filter: `user_id=eq.${userId}`, queryKeys: [transactionsKeys.all] },
  { table: "fx_rates", queryKeys: [["fx-rates"]] },
]);
```

> **Cuándo importa**: cuando uses Finify en dos pestañas (escritorio + móvil), cargues en una y veas el cambio en la otra sin recargar. También clave si compartís cuenta con pareja (futuro).
>
> **🔒 DB**: Requiere habilitar Realtime para la tabla en Supabase Studio (Database → Replication). No es migración SQL.

**No-obvio**: el hook depende de `signature` (string), no del array de subs. Esto evita que el canal se destruya y recree en cada render cuando los queryKeys son objetos nuevos pero equivalentes.

---

## 10. Patrón #9 — Hooks utilitarios reutilizables

JouveERP tiene un puñado pequeño pero muy útil. Copiar tal cual:

| Hook | Función | Uso |
|---|---|---|
| `useDebouncedValue(value, ms)` | Debounce de cualquier valor | Búsqueda en transactions feed |
| `useIntersectionObserver(ref, opts)` | Para infinite scroll trigger | Lista de transacciones |
| `useUrlFilter()` | Sincroniza filters con `?query` sin scroll-to-top | Filtros de listados |
| `useMobile()` (ya lo tenés) | Detecta breakpoint mobile | Sidebars colapsables |

**`useUrlFilter` con dos detalles no obvios** (ver `JouveERP/hooks/use-url-filter.ts`):

1. La callback se mantiene **estable** (no depende de `pathname`/`searchParams`) → un `useEffect` que la incluya no hace loop infinito.
2. Short-circuit si el URL ya tiene esos valores → `router.replace` con la misma URL **todavía** re-renderiza en Next 16.

```ts
export function useUrlFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const latestRef = useRef({ pathname, searchParams });
  useEffect(() => { latestRef.current = { pathname, searchParams }; });

  return useCallback((updates: Record<string, string | null | undefined>) => {
    const { pathname, searchParams } = latestRef.current;
    const params = new URLSearchParams(searchParams.toString());
    let changed = false;
    for (const [k, v] of Object.entries(updates)) {
      const current = params.get(k);
      const target = !v ? null : v;
      if (current === target) continue;
      if (target === null) params.delete(k); else params.set(k, target);
      changed = true;
    }
    if (!changed) return;
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [router]);
}
```

---

## 11. Patrón #10 — Validación con Zod compartida client/server

Tu schema actual está en `src/lib/validations/transaction.schema.ts`. Funciona, pero **mové el schema dentro de la feature** (`src/features/transactions/schema.ts`) y **derivá los tipos del schema**:

```ts
import { z } from "zod";

export const TransactionCreateSchema = z.object({
  date: z.string().min(1),
  transaction_type: z.enum(["income","expense","transfer","correction"]),
  description: z.string().min(1).max(200),
  // ...
});

// El tipo se infiere del schema (single source of truth)
export type TransactionCreateInput = z.infer<typeof TransactionCreateSchema>;
```

Y en el form:
```ts
const form = useForm<TransactionCreateInput>({
  resolver: zodResolver(TransactionCreateSchema),
  defaultValues: { date: today, transaction_type: "expense", /* ... */ },
});
```

Y en el action:
```ts
const parsed = TransactionCreateSchema.safeParse(input);
if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Validación" };
```

> El mismo schema valida en cliente (UX inmediata) y servidor (seguridad). El tipo es el mismo. Si cambia el schema, ambos lados se rompen en compile-time. **No hay forma de drift**.

**Type guards exportados desde el schema**:
```ts
const TRANSACTION_TYPES = ["income","expense","transfer","correction"] as const;
export function isTransactionType(v: unknown): v is TransactionType {
  return typeof v === "string" && (TRANSACTION_TYPES as readonly string[]).includes(v);
}
```

Útil cuando Postgres devuelve un `string` no constrained.

---

## 12. Patrón #11 — Tablas con TanStack Table

Ya tenés `@tanstack/react-table` en deps pero no lo usás. La tabla actual de transacciones (`_components/transactions-table.tsx`) parece ser custom. Reemplazarla con TanStack Table te da gratis:

- Sorting multi-columna
- Filtros por columna
- Resize de columnas
- Visibility toggle
- Selection (checkbox)
- Virtualización (para feeds de 1000+ rows usá `@tanstack/react-virtual`)

Estructura típica:
```tsx
const columns: ColumnDef<TransactionListItem>[] = [
  { accessorKey: "date", header: "Fecha", cell: ({ row }) => formatDate(row.original.date) },
  { accessorKey: "description", header: "Descripción" },
  { accessorKey: "amount", header: "Monto", cell: ({ row }) => formatMoney(row.original.amount, row.original.currency) },
  { id: "actions", cell: ({ row }) => <TransactionRowActions tx={row.original} /> },
];

const table = useReactTable({
  data: items,
  columns,
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
});
```

Combinado con `useUrlFilter()` (sección 10), los filtros viven en la URL y son shareables.

---

## 13. Patrón #12 — Testing (Vitest + Playwright)

### 13.1 Setup mínimo

```bash
pnpm add -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom
pnpm add -D @playwright/test
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", globals: true, setupFiles: ["./vitest.setup.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
```

### 13.2 Qué testear primero (mayor ROI)

1. **Zod schemas** (rápido, atrapa regresiones de validación):
   ```ts
   // src/features/transactions/schema.test.ts
   import { TransactionCreateSchema } from "./schema";
   test("rechaza amount = 0", () => {
     const r = TransactionCreateSchema.safeParse({ amount: 0, /* ... */ });
     expect(r.success).toBe(false);
   });
   ```

2. **Cálculos de dominio** (FX conversion, opening balances, presupuesto vs actual): puro y testable sin mocks.

3. **Permisos / RBAC** si se incorpora.

4. **RLS tests** (con dos Supabase clients en `service_role` para crear datos como user A y luego intentar leerlos como user B).

### 13.3 E2E con Playwright

Cubrí el **happy path** de cada feature crítica: crear cuenta → crear transacción → ver en lista. Suficiente para detectar rompimientos grandes en CI.

---

## 14. Patrón #13 — Observabilidad (Sentry + logger estructurado)

### 14.1 Logger

```ts
// src/lib/logger.ts
type LogLevel = "debug" | "info" | "warn" | "error";

function log(level: LogLevel, msg: string, ctx?: Record<string, unknown>) {
  const entry = { level, msg, ts: new Date().toISOString(), ...ctx };
  // En dev: console; en prod: stdout (Vercel/Sentry agarra)
  if (process.env.NODE_ENV === "development") {
    console[level === "error" ? "error" : "log"](entry);
  } else {
    process.stdout.write(JSON.stringify(entry) + "\n");
  }
}

export const logger = {
  debug: (m: string, c?: Record<string, unknown>) => log("debug", m, c),
  info:  (m: string, c?: Record<string, unknown>) => log("info", m, c),
  warn:  (m: string, c?: Record<string, unknown>) => log("warn", m, c),
  error: (m: string, c?: Record<string, unknown>) => log("error", m, c),
};
```

Convención de `msg`: `<feature>.<action>.<outcome>` → `transactions.create.failed`, `fx.fetch.timeout`. Filtrable en Sentry/CloudWatch.

### 14.2 Sentry

```bash
pnpm add @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

El wizard crea `sentry.{client,server,edge}.config.ts` automáticamente. Cosas a personalizar:
- `tracesSampleRate: 0.1` (en prod; en dev `1.0`).
- `beforeSend(event)` para filtrar errores conocidos (Supabase 401s, p. ej.).
- Tag `user_id` desde el `requireUser()` para que cada error sepa de quién es.

---

## 15. Patrón #14 — Jobs/Background con Inngest

Hoy todo es síncrono. Casos donde un background job paga dividendos:

| Caso | Hoy | Con Inngest |
|---|---|---|
| Refresh diario de FX rates | No existe | Cron `0 6 * * *` → `frankfurter.fetch.daily` |
| Refresh de precios de inversiones | On-demand al abrir la página (lento) | Job cada 4hs cachea precios en `investment_price_cache` |
| Auto-categorización de transacciones | En el `create` action | Event `transaction.created` → job que aplica `transaction_rules` |
| Procesamiento de transacciones recurrentes (generar instancias del mes) | Si lo hacés, lo tendrías que disparar manual | Cron mensual `1 * * 1 *` → genera todas las recurrentes activas |

Setup:
```bash
pnpm add inngest
```

```ts
// src/lib/inngest/client.ts
import { Inngest } from "inngest";
export const inngest = new Inngest({ id: "finify" });
```

```ts
// src/lib/inngest/functions/refresh-fx-daily.ts
import { inngest } from "../client";
import { fetchAndStoreFxRates } from "@/features/fx/lib/fetch";

export const refreshFxDaily = inngest.createFunction(
  { id: "refresh-fx-daily" },
  { cron: "0 6 * * *" },
  async ({ step }) => {
    const rates = await step.run("fetch", () => fetchAndStoreFxRates());
    return { ok: true, count: rates.length };
  },
);
```

```ts
// src/app/api/inngest/route.ts
import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { refreshFxDaily } from "@/lib/inngest/functions/refresh-fx-daily";
export const { GET, POST, PUT } = serve({ client: inngest, functions: [refreshFxDaily] });
```

> **🔒 DB**: Requiere tablas nuevas para los caches (`investment_price_cache`, `fx_rate_cache`) **solo si querés cachear**. Para el caso de "refresh FX diario", podés escribir directo a `fx_rates` que ya existe → solo nuevas filas, no schema change.

---

## 16. Patrón #15 — Seguridad: CSP, rate limit, service role

JouveERP tiene `lib/security/csp.ts` que genera un `Content-Security-Policy` con `nonce` por request y lo inyecta en el middleware. Para Finify, mínimo viable:

```ts
// src/proxy.ts (middleware)
import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic';
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: blob: https:;
    connect-src 'self' https://*.supabase.co https://api.frankfurter.app https://api.coingecko.com https://api.twelvedata.com;
    frame-ancestors 'none';
  `.replace(/\s+/g, " ").trim();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  const response = await updateSession(request, requestHeaders);
  response.headers.set("Content-Security-Policy", cspHeader);
  return response;
}
```

> **No-obvio**: CoinGecko/TwelveData necesitan estar en `connect-src` o las peticiones fallarán silenciosamente con CSP errors. Probá en dev primero.

**Rate limiting**: JouveERP tiene `lib/rate-limit.ts` con un sliding window in-memory. Para Finify, hasta que tengas usuarios públicos, no es prioridad. Cuando lo necesites, Upstash Ratelimit es plug-and-play.

---

## 17. 🤖 IA — Diseño completo para Finify

Esta es la sección madre. Lo que sigue está modelado sobre cómo el proyecto R implementa su **"AI CFO"** (agente que conoce datos contables y responde análisis). Adaptado a tu caso: **finanzas personales**.

### 17.1 Visión: ¿qué hace el agente en Finify?

Casos de uso ordenados por dificultad creciente:

1. **Preguntas analíticas sobre tus datos**
   - "¿Cuánto gasté en restaurantes en abril vs marzo?"
   - "¿Cuál es mi tasa de ahorro promedio del último trimestre?"
   - "Mostrame mis 5 categorías de gasto que más crecieron este año."

2. **Auto-categorización inteligente**
   - El usuario sube una descripción y el agente sugiere categoría/subcategoría aprendiendo del historial.

3. **Insights proactivos** (no-conversacional)
   - "Tu gasto en suscripciones aumentó 23% este mes."
   - "Tenés 3 transacciones sin categorizar de hace > 7 días."

4. **Generación de artifacts** (charts, tablas, comparativas)
   - "Comparame ingreso vs gasto de los últimos 12 meses" → genera un chart inline en el chat.

5. **Acciones con confirmación**
   - "Cancelá la recurrente de Netflix" → muestra preview, pide confirmación, ejecuta.

6. **Búsqueda semántica**
   - "Mostrame las transacciones que parecen viajes" → búsqueda vectorial, no por categoría.

### 17.2 Stack recomendado

| Componente | Tecnología | Por qué |
|---|---|---|
| SDK | **Vercel AI SDK v6** (`ai` + `@ai-sdk/anthropic` + `@ai-sdk/react`) | Streaming, tool-loop agent, integración nativa Next.js |
| Modelo principal | **Claude Sonnet 4.6** | Mejor tool-use, balance precio/calidad |
| Fallback | Claude Haiku 4.5 (modelo de respaldo si Sonnet falla) | Más barato, OK para queries simples |
| Tool definitions | **Zod** | Coincide con resto del proyecto |
| Streaming | **SSE nativo** vía AI SDK | Sin Redis ni infra extra |
| Persistencia chat | Tablas Postgres en Supabase | Sin Redis |
| Embeddings | **pgvector + Gemini embedding-001** (768 dims) o **Voyage AI** | pgvector ya disponible en Supabase, sin servicio aparte |
| Búsqueda | RPC `match_embeddings` con HNSW index | Sub-100ms para 100k+ vectores |
| UI Chat | Componente custom basado en `useChat` de `@ai-sdk/react` | Markdown, tool indicators, artifacts inline |

### 17.3 Arquitectura

```
┌─ Usuario escribe pregunta
│
├─ POST /api/ai/chat  (Route Handler)
│   ├─ Verifica sesión (requireUser)
│   ├─ Carga contexto: orgName, currency base, rango de fechas con datos
│   ├─ Persiste mensaje de usuario en finify_chat_messages
│   └─ streamText({ model, tools, system, messages })
│       │
│       ├─ Streaming chunks → cliente vía SSE
│       │
│       └─ Tool calls:
│           ├─ getTransactions({ query, dateRange })
│           ├─ compareTransactions({ a, b })
│           ├─ categorizeTransaction({ description })
│           ├─ searchSemantic({ query, topK })
│           ├─ generateChart({ data, type })
│           └─ proposeAction({ kind, payload })  ← UI muestra confirm
│
├─ Cliente: useChat() renderiza
│   ├─ Markdown del texto
│   ├─ Tool indicators ("Buscando transacciones…")
│   ├─ Artifacts cuando un tool produce data (chart, tabla)
│   └─ Confirmation cards cuando hay acciones
│
└─ onFinish: persistir mensaje del asistente
```

### 17.4 Schema de DB para chat

> **🔒 DB**: Migración nueva, **aditiva**. No toca tablas existentes. Riesgo bajo. Probar primero en branch de Supabase.

```sql
-- supabase/migrations/00XX_ai_chat.sql

CREATE TABLE finify_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,                              -- generado async (ver 17.9)
  pinned boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
CREATE INDEX finify_chat_sessions_user_idx ON finify_chat_sessions(user_id, updated_at desc);

CREATE TABLE finify_chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references finify_chat_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content jsonb not null,                  -- UIMessage completo con parts (text, tool-*, data-*)
  created_at timestamptz default now()
);
CREATE INDEX finify_chat_messages_chat_idx ON finify_chat_messages(chat_id, created_at);

-- RLS
ALTER TABLE finify_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE finify_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sess_own_all" ON finify_chat_sessions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "msg_own_all" ON finify_chat_messages FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Trigger: bump updated_at en parent cuando se inserta msg
CREATE OR REPLACE FUNCTION bump_chat_session_updated_at()
RETURNS trigger AS $$
BEGIN
  UPDATE finify_chat_sessions SET updated_at = now() WHERE id = NEW.chat_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER finify_chat_messages_bump
  AFTER INSERT ON finify_chat_messages
  FOR EACH ROW EXECUTE FUNCTION bump_chat_session_updated_at();
```

### 17.5 Estructura de carpetas para la feature

```
src/features/ai/
  ├─ agent/
  │   ├─ agent.ts                 # Definición del ToolLoopAgent
  │   ├─ prompts/
  │   │   ├─ base.ts              # System prompt base
  │   │   ├─ analytics.ts         # Bloque de instrucciones analíticas
  │   │   └─ index.ts             # buildPrompt({ route, orgContext, ... })
  │   └─ user-context.ts          # loadUserContext(): dateRange, currency, accountTypes
  ├─ tools/
  │   ├─ index.ts                 # createTools(supabase, userId, writer)
  │   ├─ get-transactions.ts
  │   ├─ compare-transactions.ts
  │   ├─ categorize-transaction.ts
  │   ├─ search-semantic.ts
  │   ├─ generate-chart.ts
  │   └─ propose-action.ts
  ├─ actions/
  │   ├─ chat-history.ts          # listChats, loadChat, deleteChat, renameChat
  │   └─ chat-title.ts            # generateChatTitle (async, modelo mini)
  ├─ api/
  │   └─ route.ts                 # POST handler (también puede ir en app/api/ai/chat/route.ts)
  ├─ components/
  │   ├─ AiChatPanel.tsx          # Container (slide-over o standalone)
  │   ├─ AiChatMessages.tsx       # Render markdown + tool indicators + artifacts
  │   ├─ AiChatInput.tsx          # Textarea + send
  │   ├─ AiChatHistoryDropdown.tsx
  │   ├─ artifacts/
  │   │   ├─ TransactionsArtifact.tsx
  │   │   ├─ ChartArtifact.tsx
  │   │   └─ ComparisonArtifact.tsx
  │   └─ ToolConfirmation.tsx
  ├─ hooks/
  │   ├─ useAiChat.tsx            # Wrapper sobre useChat con persistencia
  │   ├─ useChatHistory.ts        # Queries de chats persistidos
  │   └─ useArtifactStream.ts     # Lee data-parts de mensajes
  ├─ lib/
  │   ├─ artifact-stream.ts       # Helper para emitir data-parts
  │   └─ keys.ts                  # QueryKeys del feature
  └─ schema.ts                    # Zod de inputs/outputs de tools
```

### 17.6 Agente y prompt dinámico

```ts
// src/features/ai/agent/agent.ts
import { Experimental_Agent as ToolLoopAgent, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { buildPrompt } from "./prompts";

export function makeAgent(tools: ToolSet) {
  return new ToolLoopAgent({
    model: anthropic("claude-sonnet-4-6"),
    tools,
    stopWhen: stepCountIs(15),                  // hard limit anti-runaway

    callOptionsSchema: z.object({
      route: z.string(),                        // /dashboard, /transactions, etc
      currency: z.string(),                     // ARS, USD, etc
      dateRange: z.object({ from: z.string(), to: z.string() }).optional(),
      forceTool: z.string().optional(),
    }),

    prepareCall: ({ options, ...rest }) => ({
      ...rest,
      instructions: buildPrompt(options),
      ...(options.forceTool
        ? { toolChoice: { type: "tool" as const, toolName: options.forceTool } }
        : {}),
    }),

    prepareStep: ({ stepNumber }) =>
      stepNumber > 0 ? { toolChoice: "auto" as const } : {},
  });
}
```

```ts
// src/features/ai/agent/prompts/index.ts
import { basePrompt } from "./base";
import { analyticsPrompt } from "./analytics";

export function buildPrompt(ctx: {
  route: string;
  currency: string;
  dateRange?: { from: string; to: string };
  orgName?: string;        // opcional, default "tus finanzas"
}) {
  const today = new Date().toISOString().slice(0, 10);
  return [
    basePrompt(ctx),
    analyticsPrompt(ctx),
    `## Contexto del usuario`,
    `- Moneda base: ${ctx.currency}`,
    ctx.dateRange ? `- Datos disponibles: ${ctx.dateRange.from} a ${ctx.dateRange.to}` : "",
    `- Fecha de hoy: ${today}`,
    `- Ruta actual: ${ctx.route}`,
    "",
    `## Reglas`,
    `- NUNCA inventes datos. Si no hay info, decilo.`,
    `- Para responder análisis, SIEMPRE usá las tools — no aproximes.`,
    `- Si el usuario pide algo destructivo, usá proposeAction y esperá confirmación.`,
    `- Respondé en español rioplatense, conciso.`,
  ].filter(Boolean).join("\n");
}
```

### 17.7 Tools con dependencias inyectadas

```ts
// src/features/ai/tools/index.ts
import { tool, type ToolSet } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/types/database.types";
import { ArtifactStream } from "../lib/artifact-stream";

export function createTools(opts: {
  supabase: SupabaseClient<Database>;
  userId: string;
  writer: import("ai").UIMessageStreamWriter;
}): ToolSet {
  const { supabase, userId, writer } = opts;

  return {
    getTransactions: tool({
      description: "Obtiene transacciones del usuario filtradas por rango de fechas, categoría o búsqueda libre. Devuelve un artifact con la tabla.",
      inputSchema: z.object({
        query: z.string().optional().describe("Texto a buscar en descripción"),
        dateFrom: z.string().optional().describe("YYYY-MM-DD"),
        dateTo: z.string().optional().describe("YYYY-MM-DD"),
        categoryId: z.string().uuid().optional(),
        limit: z.number().min(1).max(500).default(100),
      }),
      execute: async (input) => {
        const artifact = new ArtifactStream("transactions", writer);
        await artifact.loading({});

        const { data, error } = await supabase.rpc("transactions_feed", {
          p_user_id: userId,
          p_search: input.query ?? null,
          p_from: input.dateFrom ?? null,
          p_to: input.dateTo ?? null,
          p_category_id: input.categoryId ?? null,
          p_limit: input.limit,
          p_offset: 0,
        });

        if (error) {
          await artifact.error({}, error.message);
          return { success: false, error: error.message };
        }
        await artifact.complete({ rows: data });
        return {
          success: true,
          instanceId: artifact.instanceId,
          summary: `Encontré ${data?.length ?? 0} transacciones.`,
        };
      },
    }),

    compareTransactions: tool({
      description: "Compara montos agregados de dos rangos (ej. mes vs mes anterior).",
      inputSchema: z.object({
        rangeA: z.object({ from: z.string(), to: z.string(), label: z.string() }),
        rangeB: z.object({ from: z.string(), to: z.string(), label: z.string() }),
        groupBy: z.enum(["category","subcategory","account","type"]).default("category"),
      }),
      execute: async (input) => {
        // RPC dedicado: compare_transactions_summary
        // ...
      },
    }),

    categorizeTransaction: tool({
      description: "Sugiere categoría/subcategoría para una descripción nueva, basándose en el historial.",
      inputSchema: z.object({
        description: z.string(),
        amount: z.number(),
        accountId: z.string().uuid().optional(),
      }),
      execute: async (input) => {
        // 1) Buscar similares en historial (semantic search opcional)
        // 2) Si hay 5+ matches con misma cat → retornar con confianza alta
        // 3) Si no → usar transaction_rules
        // 4) Si no → retornar { suggested: null, alternatives: top-3-cats }
      },
    }),

    searchSemantic: tool({
      description: "Búsqueda semántica sobre transacciones (encuentra similares por significado).",
      inputSchema: z.object({
        query: z.string(),
        topK: z.number().min(1).max(50).default(10),
      }),
      execute: async (input) => {
        // 1) Generar embedding del query con Gemini
        // 2) RPC match_transaction_embeddings
        // 3) Devolver matches
      },
    }),

    generateChart: tool({
      description: "Genera un gráfico (line/bar/pie) sobre datos provistos.",
      inputSchema: z.object({
        type: z.enum(["line","bar","pie","area"]),
        title: z.string(),
        data: z.array(z.object({ label: z.string(), value: z.number() })),
      }),
      execute: async (input) => {
        const artifact = new ArtifactStream("chart", writer);
        await artifact.complete({ type: input.type, title: input.title, data: input.data });
        return { success: true, instanceId: artifact.instanceId };
      },
    }),

    proposeAction: tool({
      description: "Propone una acción que requiere confirmación del usuario (borrar, modificar, cancelar recurrente).",
      inputSchema: z.object({
        kind: z.enum(["delete_transaction","cancel_recurring","update_budget"]),
        targetId: z.string().uuid(),
        summary: z.string(),
        payload: z.record(z.unknown()),
      }),
      execute: async (input) => {
        // Solo retorna la propuesta. La ejecución la hace el cliente al confirmar.
        return {
          success: true,
          requiresConfirmation: true,
          proposal: input,
        };
      },
    }),
  };
}
```

### 17.8 Streaming de artifacts (sin Redis)

```ts
// src/features/ai/lib/artifact-stream.ts
import type { UIMessageStreamWriter } from "ai";

export class ArtifactStream<T extends Record<string, unknown>> {
  readonly instanceId: string;
  private readonly type: `data-${string}`;
  constructor(artifactType: string, private writer: UIMessageStreamWriter, instanceId?: string) {
    this.instanceId = instanceId ?? crypto.randomUUID();
    this.type = `data-${artifactType}`;
  }
  private write(data: Record<string, unknown>) {
    this.writer.write({
      type: this.type,
      id: this.instanceId,
      data: { ...data, instanceId: this.instanceId },
    });
  }
  loading(d: Partial<T>) { this.write({ ...d, status: "loading" }); }
  progress(d: Partial<T>, pct: number) { this.write({ ...d, status: "progress", progress: pct }); }
  complete(d: T) { this.write({ ...d, status: "complete", progress: 1 }); }
  error(d: Partial<T>, msg: string) { this.write({ ...d, status: "error", error: msg }); }
}
```

> **Patrón clave**: cuando un tool tarda (porque hace RPC pesada), emite `loading` → el cliente muestra placeholder; luego `complete` con la data → el cliente lo reemplaza. UX viva sin esperas en blanco.

### 17.9 Route handler

```ts
// src/app/api/ai/chat/route.ts
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { requireUser } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { makeAgent } from "@/features/ai/agent/agent";
import { createTools } from "@/features/ai/tools";
import { loadUserContext } from "@/features/ai/agent/user-context";
import { persistUserMessage, persistAssistantMessage, ensureChatSession } from "@/features/ai/actions/chat-history";
import { generateChatTitle } from "@/features/ai/actions/chat-title";

export const maxDuration = 60;

export async function POST(req: Request) {
  const user = await requireUser();
  const { messages, route, chatId, forceTool } = await req.json() as {
    messages: UIMessage[];
    route: string;
    chatId: string;
    forceTool?: string;
  };

  const sb = await createClient();
  await ensureChatSession({ chatId, userId: user.userId });

  const lastUserMessage = messages.findLast((m) => m.role === "user");
  if (lastUserMessage) {
    await persistUserMessage({ chatId, userId: user.userId, message: lastUserMessage });
  }

  // Title async (fire and forget en primer turno)
  const isFirstTurn = messages.length === 1;
  if (isFirstTurn && lastUserMessage) {
    void generateChatTitle({ chatId, userId: user.userId, userText: extractText(lastUserMessage) });
  }

  const userCtx = await loadUserContext(sb, user.userId);

  return streamText({
    model: undefined as never, // overridden por agent
    experimental_telemetry: { isEnabled: true },
    onFinish: async ({ response }) => {
      await persistAssistantMessage({ chatId, userId: user.userId, message: response.messages[0] });
    },
  }).pipeThrough(async (writer) => {
    const tools = createTools({ supabase: sb, userId: user.userId, writer });
    const agent = makeAgent(tools);
    return agent.stream({
      messages: convertToModelMessages(messages),
      options: {
        route,
        currency: userCtx.currency,
        dateRange: userCtx.dateRange,
        forceTool,
      },
    });
  }).toUIMessageStreamResponse();
}
```

> **Nota**: el snippet anterior es esquemático. La firma exacta de `streamText` + `Experimental_Agent` cambia entre minor versions de AI SDK v6. **Mirá el sample oficial al implementar**: `https://ai-sdk.dev/docs/agents/agent-class`.

### 17.10 Cliente: `useAiChat`

Reutilizá `useChat` de `@ai-sdk/react` con `DefaultChatTransport`. Lo que **no** trae el SDK out-of-the-box y conviene agregar:

1. **Persistencia automática**: ya la hicimos en el server con `onFinish`. En el cliente solo asegurate que cada mensaje del usuario incluya el `chatId` en el body.

2. **Auto-load de chats históricos**: al montar, si `initialChatId` existe, fetch de `/chat/:id/messages` y `setMessages(reconstructed)`.

3. **Detección de artifacts**: scan de `messages.parts` buscando `data-*` parts y abrir un canvas lateral cuando aparezca.

4. **Confirmation flow**: cuando un tool retorna `requiresConfirmation: true`, render un `<ToolConfirmation>` inline. El usuario aprueba → llamás al action correspondiente (`deleteTransactionAction`, etc.) y mostrás result en chat.

### 17.11 Embeddings (búsqueda semántica)

> **🔒 DB**: Requiere extensión `vector` (ya viene en Supabase). Tabla nueva, aditiva.

```sql
-- supabase/migrations/00XX_embeddings.sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE finify_transaction_embeddings (
  transaction_id uuid primary key references transactions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  embedding vector(768) not null,
  model_id text not null default 'gemini-embedding-001',
  generated_at timestamptz default now()
);
CREATE INDEX finify_tx_emb_user_idx ON finify_transaction_embeddings(user_id);
CREATE INDEX finify_tx_emb_hnsw ON finify_transaction_embeddings
  USING hnsw (embedding vector_cosine_ops);

ALTER TABLE finify_transaction_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "emb_own_all" ON finify_transaction_embeddings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RPC para búsqueda
CREATE OR REPLACE FUNCTION match_transaction_embeddings(
  p_user_id uuid,
  p_query vector(768),
  p_threshold float DEFAULT 0.7,
  p_top_k int DEFAULT 10
)
RETURNS TABLE (transaction_id uuid, similarity float)
LANGUAGE sql STABLE
AS $$
  SELECT te.transaction_id, 1 - (te.embedding <=> p_query) AS similarity
  FROM finify_transaction_embeddings te
  WHERE te.user_id = p_user_id
    AND 1 - (te.embedding <=> p_query) >= p_threshold
  ORDER BY te.embedding <=> p_query
  LIMIT p_top_k;
$$;
```

**Ingesta**: cada vez que se crea/actualiza una transacción, encolar un job (Inngest) que:
1. Toma descripción + notas + categoría.
2. Llama Gemini embedding API.
3. Hace `UPSERT` en `finify_transaction_embeddings`.

```ts
// src/lib/inngest/functions/embed-transaction.ts
export const embedTransaction = inngest.createFunction(
  { id: "embed-transaction", concurrency: { limit: 5 } },
  { event: "transaction.created" },
  async ({ event, step }) => {
    const { transactionId, userId } = event.data;
    const tx = await step.run("fetch-tx", () => fetchTransaction(transactionId));
    const text = `${tx.description} ${tx.notes ?? ""} ${tx.category_name ?? ""}`;
    const embedding = await step.run("embed", () => generateEmbedding(text, "RETRIEVAL_DOCUMENT"));
    await step.run("upsert", () => upsertEmbedding(transactionId, userId, embedding));
  },
);
```

> **No-obvio sobre embeddings**: el `task_type` importa. Para indexar usá `RETRIEVAL_DOCUMENT`; para la query usá `RETRIEVAL_QUERY`. Si mezclás, los resultados son peores. Guardá el `model_id` con cada embedding para que si cambiás de modelo no compares peras con manzanas.

### 17.12 Prompt caching (Anthropic)

Tu system prompt va a tener 1-2K tokens fijos (instrucciones + esquemas de tools + contexto de org). Usá **prompt caching** de Anthropic para no pagarlos en cada turno:

```ts
import { anthropic } from "@ai-sdk/anthropic";

const agent = new ToolLoopAgent({
  model: anthropic("claude-sonnet-4-6", {
    cacheControl: true,                  // AI SDK gestiona
  }),
  // ...
});
```

O bien marcá manualmente los breakpoints en el system message. La parte estable (instrucciones generales) se cachea por 5 min y se cobra 10% en lugar de 100%. **Reducción típica: 60-80% del costo de input** en conversaciones largas.

### 17.13 UI Chat: detalles que marcan diferencia

Mirando cómo el proyecto R lo resuelve, las cosas que **no** salen "out of the box" pero hacen toda la diferencia:

1. **Indicador de tool activo durante streaming**
   ```tsx
   {part.type?.startsWith("tool-") && part.state === "input-available" && (
     <ToolBadge name={part.type.replace("tool-","")} status="running" />
   )}
   ```

2. **Auto-open de artifact canvas**: cuando aparece el primer `data-*` part en un message, abrí el panel lateral con el artifact. El `useEffect` debe trackear instanceIds ya abiertos para no reabrir el mismo.

3. **Render no-conversacional vs conversacional**: algunos tools (`generateChart`) son UI-only — no agregan texto al chat. Otros (`getTransactions`) sí. Tu state debe distinguir, sino el chat se llena de "Aquí están los datos:" sin texto.

4. **Restart del chat con `key` en provider**: para "Nuevo chat", la forma más limpia es remontar el provider con un `key` nuevo (UUID). Reset trivial sin manejar 8 refs.

5. **PostHog/telemetry**: trackeá `ai_message_sent`, `ai_tool_called`, `ai_artifact_opened`. Te ayuda a decidir qué tools agregar.

6. **Error boundary del chat**: si el stream se corta, mostrá un toast con "Error", **mantené los mensajes anteriores** y permití retry. No vacíes el chat.

### 17.14 Costos y rate limit

- Sonnet 4.6: ~$3 input + $15 output por MTok. Con prompt caching, input efectivo ~$0.6-1.5 por MTok.
- Una conversación típica de 5 turnos con ~3 tool calls cuesta < $0.03.
- **Rate limit por usuario**: con Upstash o tabla `ai_usage` que cuente requests/día. Empezá con 100/día por usuario.

```ts
// Rate limit simple basado en finify_chat_messages
const today = new Date().toISOString().slice(0,10);
const { count } = await sb
  .from("finify_chat_messages")
  .select("*", { count: "exact", head: true })
  .eq("user_id", userId)
  .eq("role", "user")
  .gte("created_at", `${today}T00:00:00Z`);
if ((count ?? 0) >= 100) return new Response("Daily limit reached", { status: 429 });
```

### 17.15 Roadmap incremental para IA

| Fase | Esfuerzo | Riesgo DB | Resultado |
|---|---|---|---|
| **F1** — Chat básico (sólo text-in/text-out, sin tools) | 1-2 días | 🔒 Bajo (2 tablas nuevas) | Podés "hablar" con Claude, ve tu contexto general |
| **F2** — Tool `getTransactions` + artifact tabla | 2-3 días | Ninguno (usa RPCs existentes) | Pregunta "qué gasté en X" → ve la tabla |
| **F3** — Tool `compareTransactions` + `generateChart` | 2-3 días | 🔒 Medio (1 RPC nueva, aditiva) | Comparativas con chart inline |
| **F4** — Persistencia + history dropdown | 1-2 días | Ninguno (ya está la tabla) | Chats persisten, podés volver |
| **F5** — `categorizeTransaction` + `transaction_rules` learning | 2-3 días | Ninguno | Auto-categorización con explicación |
| **F6** — Embeddings + búsqueda semántica | 3-5 días | 🔒 Medio (1 tabla nueva con vector) | "Mostrame viajes" sin categoría exacta |
| **F7** — `proposeAction` + confirmación inline | 2 días | Ninguno | El agente puede modificar/borrar con tu OK |
| **F8** — Insights proactivos (cron Inngest) | 3 días | Ninguno (lee, no escribe DB) | Cards en dashboard "Atención: gasto X subió Y%" |

> **Cada fase es independientemente útil**. F1+F2 ya es valioso. No tenés que esperar a F8.

---

## 18. 🤖 IA — Features concretas inspiradas en el proyecto R

La sección 17 describió el **andamiaje** (agent, tools, streaming, persistencia). Esta sección lista las **features de usuario final** que el proyecto R implementó y que tienen sentido portar — adaptadas a finanzas personales.

Cada feature incluye:
- **Patrón origen** en R.
- **Qué se ve en Finify** (UX concreta).
- **Tools nuevas** que requiere.
- **Esfuerzo / Riesgo DB**.

Están ordenadas por relación valor/esfuerzo decreciente.

---

### 18.1 📸 OCR de tickets, facturas y comprobantes

**Patrón en R**: pipeline OCR (workflow Temporal) que recibe archivos subidos, extrae entidades y las matchea contra el plan de cuentas.

**En Finify**:
- Botón "Subir ticket" o drag-drop directamente al chat de IA.
- Acepta foto (JPG/PNG) y PDF.
- El agente extrae: **comercio, fecha, monto, items, posible categoría**.
- Genera un preview con un botón "Crear transacción" → confirmación inline → INSERT.

**Tool nueva**:
```ts
extractFromReceipt: tool({
  inputSchema: z.object({ attachmentId: z.string() }),
  execute: async ({ attachmentId }) => {
    // 1) Fetch file de Supabase Storage
    // 2) Si es imagen → Claude vision (paso directo con input_image)
    // 3) Si es PDF → primero render a imagen (pdfjs-dist), luego vision
    // 4) Retornar JSON estructurado + matchear categoría sugerida
  },
}),
```

**Modelo**: Claude Sonnet 4.6 tiene **vision nativa**. No hace falta Tesseract ni servicio externo de OCR — pasás la imagen como `image` part al modelo y le pedís JSON estructurado.

**Por qué tiene tanto valor**: la fricción de cargar transacciones manualmente es **el** problema #1 de toda app de finanzas personales. Si podés sacar una foto del ticket del super y ver la transacción cargada en 5s, la retención sube radicalmente.

**Esfuerzo**: 3-4 días.
**🔒 DB**: requiere **Supabase Storage bucket** (`receipts/`) — no es SQL migration. Y opcionalmente columna `receipt_attachment_id` en `transactions` (aditiva, nullable).

---

### 18.2 🚨 Detección de anomalías (insights proactivos)

**Patrón en R**: workers de Python que corren detección estadística sobre los entries de cada org y generan "anomalies" persistidas en una tabla, que después aparecen en el dashboard como cards.

**En Finify** (versión simplificada, todo en Postgres + Inngest):

Reglas heurísticas, no ML:
- "Gasto en `<categoría>` este mes > 1.5× promedio últimos 6 meses."
- "Transacción de monto > 3× promedio histórico del usuario."
- "Subscription detectada (3 cargos mensuales similares) que no estaba marcada como recurring."
- "Sin transacciones en cuenta X en 30+ días."
- "Tasa de ahorro este mes < 50% del objetivo."

**Cómo funciona**:
1. Cron Inngest diario corre `detect-anomalies.fn`.
2. Para cada usuario, ejecuta una RPC `compute_anomalies(p_user_id)` que devuelve insights.
3. UPSERT en tabla `finify_insights`.
4. Dashboard muestra cards de insights no descartados.
5. El **chat puede generar más insights bajo demanda** ("¿hay algo raro en mis gastos?") usando una tool `summarizeAnomalies`.

**Tool nueva**:
```ts
summarizeAnomalies: tool({
  inputSchema: z.object({
    period: z.string().optional(),       // "current_month" | "last_30_days"
    severity: z.enum(["low","medium","high"]).optional(),
  }),
  execute: async ({ period, severity }) => {
    const { data } = await sb.rpc("get_anomalies", { p_user_id: userId, p_period: period, p_severity: severity });
    return { success: true, anomalies: data };
  },
}),
```

**🔒 DB**: tabla nueva `finify_insights` (aditiva) + 1 RPC. Riesgo bajo.

```sql
CREATE TABLE finify_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,                       -- "category_spike", "subscription_detected", etc
  severity text not null,                   -- "low" | "medium" | "high"
  title text not null,
  detail text,                              -- markdown corto
  payload jsonb,                            -- data para drill-down (ej: categoryId, comparison)
  status text default 'new',                -- new | seen | dismissed | acted
  detected_at timestamptz default now(),
  acted_at timestamptz
);
CREATE INDEX finify_insights_user_idx ON finify_insights(user_id, status, detected_at desc);
```

**Esfuerzo**: 4-5 días (cron + 3-4 reglas + UI cards + dismiss flow).

---

### 18.3 📌 Pinear insights al dashboard

**Patrón en R**: `PinInsightDialog.tsx` permite guardar un análisis generado por el agente como widget reutilizable.

**En Finify**:
- En cada respuesta del agente que produce un artifact (chart, tabla, comparativa), botón "📌 Anclar al dashboard".
- Al click: pide nombre opcional, guarda el artifact + su definición (qué tool con qué inputs lo generó) en `finify_pinned_insights`.
- En el dashboard, una sección "Mis insights" renderiza cada pin re-ejecutando la tool (datos siempre frescos) en lugar de guardar el snapshot.

**Diferencia clave con un screenshot**: los pins son **vivos**. Si pinneás "gastos en restaurantes últimos 3 meses", al volver mañana muestra los datos actualizados.

**Tabla**:
```sql
CREATE TABLE finify_pinned_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  tool_name text not null,
  tool_input jsonb not null,
  display_order int default 0,
  created_at timestamptz default now()
);
```

**Esfuerzo**: 2-3 días (después de tener tools + artifacts funcionando).
**🔒 DB**: 1 tabla aditiva. Riesgo mínimo.

---

### 18.4 📥 Importación inteligente de extractos (CSV/PDF)

**Patrón en R**: subida de archivos al chat → agente parsea → propone bulk-insert con confirmación.

**En Finify**:
- Soltás un CSV de tu banco o un PDF de extracto en el chat.
- Agente detecta formato (Santander, Galicia, BBVA, Brubank, Mercado Pago, etc.) y parsea.
- Muestra preview tipo tabla con columnas mapeadas: fecha → date, monto → amount, descripción → description, **categoría sugerida** (basado en `transaction_rules` + similitud histórica).
- Permite editar fila por fila antes de confirmar.
- Botón "Importar las 47 transacciones" → bulk insert con un solo `audit_event`.

**Tools nuevas**:
```ts
parseStatement: tool({
  inputSchema: z.object({ attachmentId: z.string(), accountId: z.string().uuid() }),
  execute: async ({ attachmentId, accountId }) => {
    // 1) Detectar formato (heurística + LLM)
    // 2) Extraer rows estructuradas
    // 3) Para cada row, sugerir categoría
    // 4) Retornar artifact "import-preview" con rows[] editables
  },
}),

bulkImportTransactions: tool({
  inputSchema: z.object({
    accountId: z.string().uuid(),
    transactions: z.array(/* schema de transacción */),
  }),
  execute: async (input) => {
    // INSERT en batch dentro de transaction
    // Devolver { requiresConfirmation: true, proposal: ... }
  },
}),
```

**Por qué es killer feature**: si tu banco no tiene API abierta (caso típico en Argentina), un usuario que entra al app por primera vez tiene 2 caminos: cargar 200 transacciones a mano (deserción) o esto (engagement instantáneo).

**Esfuerzo**: 5-7 días (parsing + UI preview + bulk + tests por banco).
**🔒 DB**: Storage bucket + opcionalmente columna `import_batch_id` en `transactions` (para deshacer importes).

---

### 18.5 🎙️ Input por voz

**Patrón en R**: `RecordButton.tsx` graba audio y lo envía como attachment al chat.

**En Finify**:
- Botón micrófono al lado del input del chat.
- Graba audio (`MediaRecorder` API, WebM/Opus).
- Envía el blob como `file` part al chat.
- Claude Sonnet 4.6 acepta audio nativo → transcribe + ejecuta.

**Casos de uso**:
- "Gasté 8500 en supermercado, ponelo en esenciales" → crea la transacción.
- "Cuánto llevo gastado este mes en restoranes" → ejecuta análisis.

**Esfuerzo**: 1-2 días (`MediaRecorder` + UI). **Sin** cambios de DB.

---

### 18.6 🎯 Tool picker UI (botones de quick actions)

**Patrón en R**: encima del input del chat hay un selector de tools/intents. Click en "Compare" → próximo mensaje fuerza esa tool.

**En Finify**:
- Antes del input, chips con: "📊 Comparar", "🔍 Buscar", "📈 Pronosticar", "📸 Subir ticket", "📥 Importar extracto".
- Click en "Comparar" → el `forceTool` se setea para la próxima invocación. El system prompt cambia para guiar al usuario ("¿Qué dos períodos querés comparar?").
- Después del primer turno, vuelve a `toolChoice: "auto"` (ya está en el agent, sección 17.6).

**Por qué importa**: los usuarios no-técnicos no descubren qué puede hacer el agente. Los chips funcionan como **discovery**. Es la diferencia entre "tengo un chatbot" y "tengo un asistente que sabe cosas concretas".

**Esfuerzo**: 1 día. **Sin** cambios de DB.

---

### 18.7 🧠 Sub-agente "Deep Analysis" con acceso SQL controlado

**Patrón en R**: agente principal (Sonnet) delega tareas complejas a un sub-agente (Opus) que corre en un sandbox con acceso a herramientas más potentes (bash, SQL libre). El handoff se hace vía una tool `agent` que retorna control después.

**En Finify** (versión segura):
- El agente principal tiene tools fast/safe (`getTransactions`, `compare`, etc.).
- Cuando el usuario pide algo que no encaja ("agrupame por día de la semana y mostrame el patrón"), el principal invoca `tool: deepAnalysis` con la pregunta.
- `deepAnalysis` corre **Opus** con una sola tool: `runReadOnlySql({ query })`.
- El SQL se ejecuta vía RPC `exec_user_sql(p_user_id, p_sql)` que:
  1. Valida que sea **solo SELECT** (parser básico, sin DDL/DML).
  2. Inyecta `WHERE user_id = auth.uid()` automáticamente.
  3. Tiene timeout de 5s.
  4. Cap de 1000 rows.

**Por qué este patrón**: la mayor parte del tiempo no necesitás Opus ni SQL libre (costoso, lento). Pero cuando lo necesitás, lo necesitás. Tener el sub-agente como **escape hatch** te da expresividad ilimitada sin pagarla siempre.

**🔒 DB crítico**: la RPC `exec_user_sql` debe estar **SECURITY INVOKER**, no `DEFINER`. Si la hacés `DEFINER` con la service role, un prompt injection puede escapar el filtro `user_id`. Esto **necesita revisión de seguridad** antes de ir a prod. Riesgo no trivial.

**Alternativa más segura**: en vez de SQL libre, exponé un set de RPCs predefinidas adicionales (`group_by_day_of_week`, `time_series_by_category`, etc.) y el sub-agente compone llamadas. Menos potente, mucho más seguro.

**Esfuerzo**: 3 días (versión predefinidas) / 7+ días (versión SQL libre con sandboxing real).

---

### 18.8 📅 Reporte mensual generado por IA (digest)

**Patrón en R**: workflow temporal que genera reportes a partir de plantillas + datos del período.

**En Finify**:
- Cron Inngest el día 1 de cada mes, para cada usuario activo.
- Llama una RPC `monthly_report_data(p_user_id, p_month_id)` que retorna agregados.
- Agente genera markdown: "Tu mes en números", top categorías, comparativa con mes anterior, alertas, sugerencias.
- Persiste en `finify_monthly_reports`.
- Notificación in-app (badge en sidebar) + opcional email.

**Por qué**: la mayoría de la gente quiere "ver el resumen del mes" pero no abre la app para construirlo. Si el resumen aparece solo, lo van a leer.

**Tabla**:
```sql
CREATE TABLE finify_monthly_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  year int not null,
  month int not null,
  markdown text not null,
  data jsonb,                              -- raw para re-render si cambia el template
  read_at timestamptz,
  created_at timestamptz default now(),
  unique(user_id, year, month)
);
```

**Esfuerzo**: 3-4 días.
**🔒 DB**: 1 tabla aditiva, 1 RPC.

---

### 18.9 🔎 Búsqueda semántica de transacciones

Ya cubierta en sección 17.11. Listo acá para completitud.

**Patrón en R**: pgvector + Gemini embeddings + RPC `match_embeddings`.

**Casos de uso en Finify**:
- "Mostrame todas las transacciones que parezcan viajes" — sin tener categoría "viajes" explícita.
- "Algo parecido a 'Edesur'" — encuentra electricidad aunque haya cambiado el nombre del comercio.
- Onboarding: al importar histórico, el agente clusteriza transacciones similares y sugiere reglas (`transaction_rules`) que cubren múltiples casos a la vez.

**Esfuerzo**: 3-5 días.
**🔒 DB**: extensión `vector` + tabla `finify_transaction_embeddings` + RPC. Aditivo.

---

### 18.10 💬 Coach financiero proactivo

**Patrón en R**: sistema de "tareas" generadas por agentes que el usuario debe atender (ej. clasificar entries, revisar anomalies).

**En Finify**:
- Tabla `finify_coach_tasks` con tareas auto-generadas:
  - "Tenés 12 transacciones sin categorizar de los últimos 7 días."
  - "Tu meta 'Viaje a Europa' está atrasada — ¿revisamos el aporte mensual?"
  - "Detecté 3 cargos a un servicio que no marcaste como recurring."
  - "Tu cartera tiene 80% en USD. Hace 6 meses estaba 60%. ¿Querés rebalancear?"
- Inbox de coach en sidebar (badge con contador).
- Cada tarea tiene un CTA que abre el chat con el contexto pre-cargado (el agente ya sabe de qué se trata).

**Diferencia con 18.2 (anomalies)**: anomalies son **observaciones** ("esto pasó"). Coach tasks son **acciones sugeridas** ("hacé esto"). Pueden venir del mismo trigger pero el framing UX es distinto.

**Esfuerzo**: 4-5 días + diseño UX cuidadoso (este pattern se vuelve molesto fácil).
**🔒 DB**: 1 tabla aditiva.

---

### 18.11 📊 Report builder conversacional

**Patrón en R**: `report-builder` artifact + tool `createOrEditReport`. El usuario describe el reporte que quiere y el agente lo construye iterativamente.

**En Finify** (variante simplificada):
- "Quiero ver mi gasto mensual en restaurantes, supermercado y transporte como gráfico de líneas del último año, en USD."
- El agente genera un **reporte guardable** (no solo un chart efímero).
- El reporte vive en `finify_saved_reports` con su definición (rangos, agrupaciones, transformaciones).
- Lista de reportes guardados en `/reports` con re-ejecución on-demand.
- Iterable: "ahora añadime también ocio" → edita el reporte existente.

**Vs pinned insights (18.3)**: pinned insights son single-tool snapshots. Reports son objetos más complejos con múltiples queries/agregaciones encadenadas.

**Esfuerzo**: 6-8 días (es básicamente un mini-DSL de reportes en JSON + renderer).
**🔒 DB**: 1 tabla aditiva.

---

### 18.12 🔌 Servidor MCP de Finify

**Patrón en R**: expone su API como servidor MCP via stdio, permitiendo conectar Claude Desktop / Cursor / cualquier MCP host directamente a los datos.

**En Finify**:
- Paquete `finify-mcp` que el usuario instala globalmente.
- Configurás en Claude Desktop con tu JWT de Supabase.
- Tu Claude personal ahora puede leer tus finanzas: "Claude, ¿cuánto llevo gastado este mes?" desde el desktop, sin abrir Finify.
- Tools idénticas a las del agente in-app, pero expuestas vía MCP.

**Por qué es interesante (y por qué dejarlo para el final)**:
- Para el power user / técnico, es **fenomenal**.
- Para el usuario promedio es invisible.
- La auth es no trivial (manejo seguro de JWT en stdio MCP).
- No suma valor hasta tener todas las tools maduras.

**Esfuerzo**: 5-7 días después de tener tools estables.
**🔒 DB**: ninguno (es solo otra surface sobre lo mismo).

---

### 18.13 📈 Análisis de cartera de inversiones

**Patrón en R**: dominio especializado del agente (`domains/reporting`) con tools propias.

**En Finify** — adaptación natural ya que la feature de inversiones existe:
- Tool `analyzePortfolio({ asOfDate? })` que retorna composición actual, P&L realizada/no realizada, sharpe simple, concentración por activo/sector/moneda.
- Tool `simulateScenario({ price_change: { ticker, percent } })` — "¿qué pasa si BTC cae 20%?" → recalcula valor de cartera.
- Tool `compareBenchmark({ benchmark, period })` — vs S&P 500, vs CEDEAR equivalente, vs inflación ARS.

El agente puede responder cosas tipo:
- "¿Cómo va mi cartera vs la inflación este año?"
- "Tengo 40% en MELI. ¿Es mucha concentración?"
- "Si vendo todo mi crypto y compro CEDEARs, ¿qué pasaría?"

**Esfuerzo**: 4-6 días.
**🔒 DB**: opcionalmente cachear benchmarks (`finify_benchmark_history`) — aditivo.

---

### 18.14 Resumen: prioridad por valor / esfuerzo

| # | Feature | Valor user | Esfuerzo | Riesgo DB | Fase |
|---|---|---|---|---|---|
| 18.5 | Input por voz | Alto | 1-2d | Ninguno | F2 |
| 18.6 | Tool picker UI | Alto (discovery) | 1d | Ninguno | F2 |
| 18.1 | OCR de tickets | **Altísimo** | 3-4d | Storage bucket | F3 |
| 18.2 | Detección de anomalías | Alto | 4-5d | 🔒 1 tabla + RPC | F4 |
| 18.3 | Pin insights al dashboard | Medio-alto | 2-3d | 🔒 1 tabla | F4 |
| 18.4 | Import inteligente CSV/PDF | **Altísimo** | 5-7d | Storage + col aditiva | F5 |
| 18.9 | Búsqueda semántica | Medio | 3-5d | 🔒 pgvector + tabla | F6 |
| 18.8 | Reporte mensual auto | Alto (retención) | 3-4d | 🔒 1 tabla + RPC | F6 |
| 18.13 | Análisis de cartera | Medio-alto | 4-6d | Opcional cache | F7 |
| 18.10 | Coach proactivo | Medio | 4-5d | 🔒 1 tabla | F7 |
| 18.7 | Sub-agente con SQL | Medio (power users) | 3-7d | 🔒 RPC sensible | F8 |
| 18.11 | Report builder | Medio | 6-8d | 🔒 1 tabla | F8 |
| 18.12 | Servidor MCP | Bajo-medio | 5-7d | Ninguno | F9 |

**Mi recomendación si tuviera que elegir 4 para construir primero**:
1. **OCR de tickets (18.1)** — reduce fricción de carga, killer feature single-handed.
2. **Tool picker UI (18.6)** — barato y multiplica la utilidad percibida de todo el resto.
3. **Anomalías + cards (18.2)** — convierte la app en "asistente" en lugar de "spreadsheet".
4. **Import inteligente (18.4)** — el onboarding de cualquier usuario nuevo se vuelve un suspiro.

Con esos 4, Finify pasa de "una app de finanzas con IA" a "una app que se siente como tener un asistente financiero personal". El resto son refinamientos.

---

## 19. Plan de adopción priorizado

Ordenado por **valor / esfuerzo / riesgo DB**:

### Sprint 1 — Cimientos sin tocar DB (2-3 días)

1. **Regenerar `database.types.ts`** y tipar los Supabase clients.
2. **Migrar envelope a `{ ok, data | error }`** + crear `lib/query/run-action.ts`.
3. **Crear factory `makeQueryClient`** y `prefetchQueries` / `Hydrate`.
4. **Agregar `ThemeProvider`** + `Toaster richColors` al root layout.
5. **`requireUser()` con `React.cache`** en `lib/auth/context.ts`.
6. **Hooks `useDebouncedValue`, `useIntersectionObserver`, `useUrlFilter`**.
7. **Logger estructurado** (`lib/logger.ts`).

### Sprint 2 — Reorganización + testing (3-5 días)

8. **Mover a estructura `features/`** (git mv, sin cambios funcionales).
9. **Schemas Zod adentro de cada feature**, derivar tipos del schema.
10. **Vitest + 5 tests críticos** (schemas + cálculos de dominio + RLS).
11. **Sentry** integrado con tag `user_id`.
12. **CSP en middleware** (con nonce, conexiones a tus 3 APIs externas).

### Sprint 3 — DB-aditivo de bajo riesgo (3-5 días) 🔒

13. **Audit log**: tabla `audit_events` + helper + tag en mutations críticas.
14. **Soft delete** en `accounts`, `investments`, `recurring_transactions`.
15. **RPCs nuevas**: `dashboard_summary`, `category_drilldown`, `net_worth_evolution`. Probar en branch Supabase antes de prod.
16. **Realtime habilitado** + `useRealtimeInvalidate` en páginas clave.

### Sprint 4 — Background jobs (2-3 días)

17. **Inngest** + cron `refresh-fx-daily` (escribe en `fx_rates` existente, no schema change).
18. **`refresh-investment-prices` cada 4h** (cache en `investment_price_cache` nuevo).
19. **Event `transaction.created` → re-apply rules** asincrónico.

### Sprint 5+ — IA (ver roadmap 17.15 + features sección 18)

20. **F1-F2**: chat básico + `getTransactions` + tool picker UI (18.6) + input por voz (18.5).
21. **F3**: OCR de tickets (18.1) + tool `compareTransactions` + `generateChart`.
22. **F4**: persistencia + history dropdown + detección de anomalías (18.2) + pin insights (18.3).
23. **F5**: import inteligente CSV/PDF (18.4) + auto-categorización.
24. **F6**: embeddings/búsqueda semántica (18.9) + reporte mensual auto (18.8).
25. **F7**: análisis de cartera (18.13) + coach proactivo (18.10) + `proposeAction` + confirm.
26. **F8**: sub-agente deep analysis (18.7) + report builder (18.11).
27. **F9** (opcional power-user): servidor MCP de Finify (18.12).

---

## Apéndice — Decisiones que dejé planteadas

- **¿RBAC?**: No urgente, single-user funciona. Reabrir si agregás cuentas compartidas.
- **¿Service role key?**: Sí, necesario para audit log e Inngest. Guardar en `.env.local` sin prefijo `NEXT_PUBLIC_`.
- **¿Vercel AI SDK vs SDK directo de Anthropic?**: AI SDK. La integración con `useChat`, streaming SSE y artifacts vale el costo de la dep extra.
- **¿pgvector vs servicio externo (Pinecone)?**: pgvector. Ya está en Supabase, RLS gratis, sin segundo proveedor.
- **¿Inngest vs Vercel Cron?**: Inngest. Vercel Cron es solo time-triggered; Inngest tiene event-triggered + retries + concurrency control. Para "recibir event → embed → upsert" es muy superior.
- **¿Streaming con Redis (como hace el proyecto R)?**: **No** para Finify. Para single-user Next.js, el SSE del AI SDK alcanza. Redis hace falta cuando hay workers separados (Temporal, etc.).

---

## Referencias rápidas (archivos clave a copiar de JouveERP)

| Archivo origen | Destino propuesto |
|---|---|
| `lib/query/query-client.ts` | `src/lib/query/query-client.ts` |
| `lib/query/prefetch.ts` | `src/lib/query/prefetch.ts` |
| `lib/query/hydrate.tsx` | `src/lib/query/hydrate.tsx` |
| `lib/query/run-action.ts` | `src/lib/query/run-action.ts` |
| `lib/auth/context.ts` | `src/lib/auth/context.ts` |
| `lib/logger.ts` | `src/lib/logger.ts` |
| `hooks/use-realtime-invalidate.ts` | `src/hooks/use-realtime-invalidate.ts` |
| `hooks/use-url-filter.ts` | `src/hooks/use-url-filter.ts` |
| `hooks/use-debounced-value.ts` | `src/hooks/use-debounced-value.ts` |
| `hooks/use-intersection-observer.ts` | `src/hooks/use-intersection-observer.ts` |
| `components/providers/theme-provider.tsx` | `src/components/providers/theme-provider.tsx` |
| `components/providers/query-provider.tsx` | `src/components/providers/query-provider.tsx` (reemplaza el actual) |
| `lib/security/csp.ts` | `src/lib/security/csp.ts` |

Para IA: no hay archivos para copiar tal cual (proyecto R tiene una arquitectura más compleja con Temporal/Redis que no aplica a Finify). Lo que sí sirve son los patrones documentados en sección 17.
