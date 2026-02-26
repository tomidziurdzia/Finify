export const TRANSACTION_TYPES = [
  "income",
  "expense",
  "transfer",
  "correction",
] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  income: "Ingreso",
  expense: "Gasto",
  transfer: "Transferencia",
  correction: "Corrección",
};

export interface Transaction {
  id: string;
  user_id: string;
  account_id: string;
  category_id: string | null;
  transaction_type: TransactionType;
  date: string;
  description: string;
  amount: number;
  original_currency: string;
  exchange_rate: number;
  base_amount: number;
  transfer_linked_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TransactionWithRelations extends Transaction {
  account_name: string;
  account_currency_symbol: string;
  category_name: string | null;
}
