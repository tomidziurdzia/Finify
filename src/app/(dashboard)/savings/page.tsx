import { SavingsGoalsList } from "./_components/SavingsGoalsList";

export default function SavingsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Metas de Ahorro</h1>
        <p className="text-muted-foreground text-sm">
          Creá metas con monto objetivo y fecha límite para motivar y trackear
          tu ahorro.
        </p>
      </div>
      <SavingsGoalsList />
    </div>
  );
}
