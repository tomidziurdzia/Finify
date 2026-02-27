export const NW_ITEM_SIDES = ["asset", "liability"] as const;
export type NwItemSide = (typeof NW_ITEM_SIDES)[number];

export const NW_ITEM_SIDE_LABELS: Record<NwItemSide, string> = {
  asset: "Activo",
  liability: "Pasivo",
};

export interface NwItem {
  id: string;
  user_id: string;
  name: string;
  side: NwItemSide;
  account_id: string | null;
  currency: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface NwItemWithRelations extends NwItem {
  account_name: string | null;
  currency_symbol: string;
}

export interface NwSnapshot {
  id: string;
  nw_item_id: string;
  year: number;
  month: number;
  amount: number;
  amount_base: number | null;
  created_at: string;
}

export interface NwSnapshotWithItem extends NwSnapshot {
  item_name: string;
  item_side: NwItemSide;
  currency: string;
  currency_symbol: string;
}

export interface NwMonthSummary {
  year: number;
  month: number;
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  items: {
    item_id: string;
    item_name: string;
    side: NwItemSide;
    amount: number;
    amount_base: number | null;
    currency: string;
    currency_symbol: string;
  }[];
}
