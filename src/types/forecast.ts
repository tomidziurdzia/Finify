export interface ForecastPoint {
  year: number;
  month: number;
  label: string;
  projected_balance: number;
  projected_income: number;
  projected_expenses: number;
  is_actual: boolean;
}
