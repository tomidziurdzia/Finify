"use server";

import { createClient } from "@/lib/supabase/server";
import {
  CreateTransactionRuleSchema,
  UpdateTransactionRuleSchema,
} from "@/lib/validations/transaction-rules.schema";
import type {
  TransactionRuleWithCategory,
  RuleMatch,
} from "@/types/transaction-rules";

type ActionResult<T> = { data: T } | { error: string };

// --- GET ALL RULES ---
export async function getTransactionRules(): Promise<
  ActionResult<TransactionRuleWithCategory[]>
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const { data, error } = await supabase
      .from("transaction_rules")
      .select(
        `
        *,
        budget_categories!action_category_id ( name ),
        accounts!action_account_id ( name )
      `
      )
      .eq("user_id", user.id)
      .order("priority", { ascending: false })
      .order("name", { ascending: true });

    if (error) return { error: error.message };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapped = (data ?? []).map((row: any) => ({
      ...row,
      category_name: row.budget_categories?.name ?? null,
      account_name: row.accounts?.name ?? null,
      budget_categories: undefined,
      accounts: undefined,
    }));

    return { data: mapped as TransactionRuleWithCategory[] };
  } catch (e) {
    console.error("getTransactionRules:", e);
    return { error: "Error al obtener las reglas" };
  }
}

// --- CREATE RULE ---
export async function createTransactionRule(
  input: unknown
): Promise<ActionResult<TransactionRuleWithCategory>> {
  try {
    const parsed = CreateTransactionRuleSchema.safeParse(input);
    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const { data, error } = await supabase
      .from("transaction_rules")
      .insert({ ...parsed.data, user_id: user.id })
      .select(
        `
        *,
        budget_categories!action_category_id ( name ),
        accounts!action_account_id ( name )
      `
      )
      .single();

    if (error) return { error: error.message };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = data as any;
    return {
      data: {
        ...row,
        category_name: row.budget_categories?.name ?? null,
        account_name: row.accounts?.name ?? null,
      } as TransactionRuleWithCategory,
    };
  } catch (e) {
    console.error("createTransactionRule:", e);
    return { error: "Error al crear la regla" };
  }
}

// --- UPDATE RULE ---
export async function updateTransactionRule(
  input: unknown
): Promise<ActionResult<TransactionRuleWithCategory>> {
  try {
    const parsed = UpdateTransactionRuleSchema.safeParse(input);
    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }

    const { id, ...updates } = parsed.data;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const { data, error } = await supabase
      .from("transaction_rules")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select(
        `
        *,
        budget_categories!action_category_id ( name ),
        accounts!action_account_id ( name )
      `
      )
      .single();

    if (error) return { error: error.message };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = data as any;
    return {
      data: {
        ...row,
        category_name: row.budget_categories?.name ?? null,
        account_name: row.accounts?.name ?? null,
      } as TransactionRuleWithCategory,
    };
  } catch (e) {
    console.error("updateTransactionRule:", e);
    return { error: "Error al actualizar la regla" };
  }
}

// --- DELETE RULE ---
export async function deleteTransactionRule(
  id: string
): Promise<ActionResult<null>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const { error } = await supabase
      .from("transaction_rules")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return { error: error.message };
    return { data: null };
  } catch (e) {
    console.error("deleteTransactionRule:", e);
    return { error: "Error al eliminar la regla" };
  }
}

// --- MATCH RULES against description/notes ---
export async function matchTransactionRules(
  description: string,
  notes?: string | null
): Promise<ActionResult<RuleMatch | null>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const { data: rules, error } = await supabase
      .from("transaction_rules")
      .select(
        `
        id, name, match_field, match_type, match_value,
        action_category_id, action_account_id, action_rename,
        budget_categories!action_category_id ( name ),
        accounts!action_account_id ( name )
      `
      )
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("priority", { ascending: false });

    if (error) return { error: error.message };
    if (!rules || rules.length === 0) return { data: null };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const rule of rules as any[]) {
      const field =
        rule.match_field === "description"
          ? (description ?? "").toLowerCase()
          : (notes ?? "").toLowerCase();
      const matchValue = (rule.match_value ?? "").toLowerCase();

      let matches = false;
      switch (rule.match_type) {
        case "contains":
          matches = field.includes(matchValue);
          break;
        case "starts_with":
          matches = field.startsWith(matchValue);
          break;
        case "exact":
          matches = field === matchValue;
          break;
      }

      if (matches) {
        return {
          data: {
            rule_id: rule.id,
            rule_name: rule.name,
            category_id: rule.action_category_id,
            category_name: rule.budget_categories?.name ?? null,
            account_id: rule.action_account_id,
            account_name: rule.accounts?.name ?? null,
            rename_to: rule.action_rename,
          },
        };
      }
    }

    return { data: null };
  } catch (e) {
    console.error("matchTransactionRules:", e);
    return { error: "Error al buscar reglas" };
  }
}
