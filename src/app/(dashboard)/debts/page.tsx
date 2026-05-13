import { DebtsTable } from "./_components/DebtsTable";

export default function DebtsPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Deudas</h1>
        <p className="text-muted-foreground text-sm">
          Administrá tus deudas y pasivos.
        </p>
      </div>
      <DebtsTable />
    </div>
  );
}
