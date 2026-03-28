import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardClient } from "./_components/DashboardClient";

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardPageFallback />}>
      <DashboardClient />
    </Suspense>
  );
}

function DashboardPageFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-64" />
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
