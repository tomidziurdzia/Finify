import { InvestmentsTable } from "./_components/InvestmentsTable";

export default function InvestmentsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Inversiones</h1>
        <p className="text-muted-foreground text-sm">
          Registrá y seguí tus inversiones en acciones, ETFs, crypto y más.
        </p>
      </div>
      <InvestmentsTable />
    </div>
  );
}
