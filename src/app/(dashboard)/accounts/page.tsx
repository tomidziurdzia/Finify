import { AccountsTable } from "./_components/AccountsTable";

export default function AccountsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Cuentas</h1>
        <p className="text-muted-foreground text-sm">
          Administrá tus cuentas bancarias, brokers, wallets y más.
        </p>
      </div>
      <AccountsTable />
    </div>
  );
}
