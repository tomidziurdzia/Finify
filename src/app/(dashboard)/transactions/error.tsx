"use client";

import { Button } from "@/components/ui/button";

export default function TransactionsError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center">
      <p className="font-medium text-destructive">Error al cargar transacciones</p>
      <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
      <Button className="mt-3" variant="outline" onClick={reset}>
        Reintentar
      </Button>
    </div>
  );
}
