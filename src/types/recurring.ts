export const RECURRENCE_OPTIONS = [
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "yearly",
] as const;
export type Recurrence = (typeof RECURRENCE_OPTIONS)[number];

export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  weekly: "Semanal",
  biweekly: "Quincenal",
  monthly: "Mensual",
  quarterly: "Trimestral",
  yearly: "Anual",
};

export interface RecurringTransaction {
  id: string;
  user_id: string;
  description: string;
  type: "income" | "expense";
  category_id: string | null;
  account_id: string;
  amount: number;
  currency: string;
  exchange_rate: number | null;
  base_amount: number | null;
  recurrence: Recurrence;
  day_of_month: number | null;
  day_of_week: number | null;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecurringWithRelations extends RecurringTransaction {
  account_name: string;
  category_name: string | null;
  currency_symbol: string;
}

export interface PendingRecurring {
  recurring: RecurringWithRelations;
  expected_date: string;
  is_registered: boolean;
}
