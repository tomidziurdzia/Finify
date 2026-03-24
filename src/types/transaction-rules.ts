export const MATCH_FIELDS = ["description", "notes"] as const;
export type MatchField = (typeof MATCH_FIELDS)[number];

export const MATCH_TYPES = ["contains", "starts_with", "exact"] as const;
export type MatchType = (typeof MATCH_TYPES)[number];

export const MATCH_FIELD_LABELS: Record<MatchField, string> = {
  description: "Descripción",
  notes: "Notas",
};

export const MATCH_TYPE_LABELS: Record<MatchType, string> = {
  contains: "Contiene",
  starts_with: "Empieza con",
  exact: "Exacto",
};

export interface TransactionRule {
  id: string;
  user_id: string;
  name: string;
  match_field: MatchField;
  match_type: MatchType;
  match_value: string;
  action_category_id: string | null;
  action_rename: string | null;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TransactionRuleWithCategory extends TransactionRule {
  category_name: string | null;
}

export interface RuleMatch {
  rule_id: string;
  rule_name: string;
  category_id: string | null;
  category_name: string | null;
  rename_to: string | null;
}
