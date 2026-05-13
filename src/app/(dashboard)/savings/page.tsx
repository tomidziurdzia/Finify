import { SavingsGoalsList } from "./_components/SavingsGoalsList";

export default function SavingsPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Metas de Ahorro</h1>
        <p className="text-muted-foreground text-sm">
          Creá metas con monto objetivo y fecha límite para motivar y trackear
          tu ahorro.
        </p>
      </div>
      <SavingsGoalsList />
    </div>
  );
}
