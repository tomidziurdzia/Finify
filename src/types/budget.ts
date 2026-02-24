export const BUDGET_CATEGORY_TYPES = [
  "income",
  "essential_expenses",
  "discretionary_expenses",
  "debt_payments",
  "savings",
  "investments",
] as const;

export type BudgetCategoryType = (typeof BUDGET_CATEGORY_TYPES)[number];

export const BUDGET_CATEGORY_LABELS: Record<BudgetCategoryType, string> = {
  income: "Ingresos",
  essential_expenses: "Gastos Esenciales",
  discretionary_expenses: "Gastos Discrecionales",
  debt_payments: "Pago de Deudas",
  savings: "Ahorros",
  investments: "Inversiones",
};

export interface BudgetYear {
  id: string;
  user_id: string;
  year: number;
}

export interface BudgetCategory {
  id: string;
  user_id: string;
  category_type: BudgetCategoryType;
  name: string;
  monthly_amount: number;
  display_order: number;
  created_at: string;
  updated_at: string;
}
