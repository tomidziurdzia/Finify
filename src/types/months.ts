export interface Month {
  id: string;
  user_id: string;
  year: number;
  month: number;
  created_at: string;
  updated_at: string;
}

export interface OpeningBalance {
  id: string;
  month_id: string;
  account_id: string;
  opening_amount: number;
  opening_base_amount: number;
  created_at: string;
  account_name: string;
  account_currency: string;
  account_currency_symbol: string;
}

export interface OpeningBalancePreview {
  account_id: string;
  account_name: string;
  account_currency: string;
  account_currency_symbol: string;
  opening_amount: number;
  opening_base_amount: number;
}

export interface NextMonthPreview {
  year: number;
  month: number;
  balances: OpeningBalancePreview[];
}
