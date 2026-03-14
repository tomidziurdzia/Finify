export interface SavingsGoal {
  id: string;
  user_id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  currency: string;
  deadline: string | null;
  account_id: string | null;
  color: string;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface SavingsGoalWithRelations extends SavingsGoal {
  account_name: string | null;
  currency_symbol: string;
  progress_pct: number;
}
