import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { TransactionsTable } from "./_components/TransactionsTable";

export default function TransactionsPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Transacciones</h1>
        <p className="text-muted-foreground text-sm">
          Registrá tus ingresos, gastos, transferencias y correcciones.
        </p>
      </div>
      <Suspense fallback={<TransactionsPageFallback />}>
        <TransactionsTable />
      </Suspense>
    </div>
  );
}

function TransactionsPageFallback() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
