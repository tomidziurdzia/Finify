"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useBudgetCategories } from "@/hooks/useBudget";
import { Skeleton } from "@/components/ui/skeleton";

export default function BudgetPage() {
  const { data: categories, isLoading } = useBudgetCategories();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Presupuesto</h1>
        <p className="text-muted-foreground text-sm">
          Definí tus categorías con tipo de movimiento y monto mensual. Luego cargá transacciones por mes.
        </p>
      </div>
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-muted-foreground mb-4">
          {!categories?.length
            ? "Aún no tenés categorías. Creálas desde Categorías."
            : `Tenés ${categories.length} categoría(s). Gestionálas o agregá transacciones cuando esté listo el módulo.`}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/budget/categories">Ir a Categorías</Link>
        </Button>
      </div>
    </div>
  );
}
