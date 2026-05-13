import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { InvestmentsTable } from "./_components/InvestmentsTable";

export default function InvestmentsPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Inversiones</h1>
        <p className="text-muted-foreground text-sm">
          Registrá y seguí tus inversiones en acciones, ETFs, crypto y más.
        </p>
      </div>
      <Suspense fallback={<InvestmentsPageFallback />}>
        <InvestmentsTable />
      </Suspense>
    </div>
  );
}

function InvestmentsPageFallback() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-10 w-40" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-80 w-full" />
    </div>
  );
}
