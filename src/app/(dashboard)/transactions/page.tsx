import { TransactionsTable } from "./_components/TransactionsTable";

export default function TransactionsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Transacciones</h1>
        <p className="text-muted-foreground text-sm">
          Registrá tus ingresos, gastos, transferencias y correcciones.
        </p>
      </div>
      <TransactionsTable />
    </div>
  );
}
