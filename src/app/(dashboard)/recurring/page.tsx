import { RecurringTable } from "./_components/RecurringTable";

export default function RecurringPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Transacciones Recurrentes</h1>
          <p className="text-muted-foreground text-sm">
            Definí gastos e ingresos que se repiten periódicamente para
            automatizar tu registro mensual.
          </p>
        </div>
      </div>
      <RecurringTable />
    </div>
  );
}
