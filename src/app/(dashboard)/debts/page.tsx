import { DebtsTable } from "./_components/DebtsTable";

export default function DebtsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Deudas</h1>
        <p className="text-muted-foreground text-sm">
          Administrá tus deudas y pasivos.
        </p>
      </div>
      <DebtsTable />
    </div>
  );
}
