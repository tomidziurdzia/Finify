import { RecurringTable } from "./_components/RecurringTable";

export default function RecurringPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Transacciones Recurrentes
        </h1>
        <p className="text-muted-foreground text-sm">
          Definí gastos e ingresos que se repiten periódicamente para
          automatizar tu registro mensual.
        </p>
      </div>
      <RecurringTable />
    </div>
  );
}
