import { AccountsTable } from "./_components/AccountsTable";

export default function AccountsPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Cuentas</h1>
        <p className="text-muted-foreground text-sm">
          Administrá tus cuentas bancarias, brokers, wallets y más.
        </p>
      </div>
      <AccountsTable />
    </div>
  );
}
