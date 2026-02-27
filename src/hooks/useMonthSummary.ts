import { useMemo } from "react";
import type { TransactionWithRelations } from "@/types/transactions";
import type { OpeningBalance } from "@/types/months";

export interface MonthSummary {
  openingBase: number;
  income: number;
  essentialExpenses: number;
  discretionaryExpenses: number;
  debtPayments: number;
  savings: number;
  investments: number;
  totalExpenses: number;
  netMonth: number;
  closingBase: number;
}

export interface AccountBalance {
  name: string;
  currencyCode: string;
  symbol: string;
  opening: number;
  closing: number;
}

export function getPrimaryLine(tx: TransactionWithRelations) {
  if (tx.amounts.length === 0) return null;
  if (tx.transaction_type === "transfer") {
    return tx.amounts.find((line) => line.amount < 0) ?? tx.amounts[0];
  }
  return tx.amounts[0];
}

export function useMonthSummary(
  transactions: TransactionWithRelations[] | undefined,
  openingBalances: OpeningBalance[] | undefined,
): { monthSummary: MonthSummary; accountMonthlyBalances: AccountBalance[] } {
  const txs = transactions ?? [];

  const monthSummary = useMemo<MonthSummary>(() => {
    const openingBase = (openingBalances ?? []).reduce((acc, b) => {
      const value =
        b.current_opening_base_amount ?? b.opening_base_amount ?? 0;
      return acc + value;
    }, 0);

    const getPrimaryBase = (tx: TransactionWithRelations): number => {
      const line = getPrimaryLine(tx);
      if (!line) return 0;
      // Preferimos el monto convertido dinámicamente a la moneda base actual;
      // si no está disponible, caemos al base_amount persistido.
      return line.current_base_amount ?? line.base_amount ?? 0;
    };

    const sumByCategoryType = (
      categoryType: TransactionWithRelations["category_type"],
    ) =>
      txs.reduce((acc, tx) => {
        if (tx.transaction_type === "transfer") return acc;
        if (tx.category_type !== categoryType) return acc;
        return acc + Math.abs(getPrimaryBase(tx));
      }, 0);

    const netMonth = txs.reduce((acc, tx) => {
      if (tx.transaction_type === "transfer") return acc;
      return acc + getPrimaryBase(tx);
    }, 0);

    const income = txs.reduce((acc, tx) => {
      if (tx.transaction_type !== "income") return acc;
      return acc + Math.abs(getPrimaryBase(tx));
    }, 0);

    const essentialExpenses = sumByCategoryType("essential_expenses");
    const discretionaryExpenses = sumByCategoryType("discretionary_expenses");
    const debtPayments = sumByCategoryType("debt_payments");
    const savings = sumByCategoryType("savings");
    const investments = sumByCategoryType("investments");
    const totalExpenses =
      essentialExpenses +
      discretionaryExpenses +
      debtPayments +
      savings +
      investments;

    return {
      openingBase,
      income,
      essentialExpenses,
      discretionaryExpenses,
      debtPayments,
      savings,
      investments,
      totalExpenses,
      netMonth,
      closingBase: openingBase + netMonth,
    };
  }, [openingBalances, txs]);

  const accountMonthlyBalances = useMemo<AccountBalance[]>(() => {
    const byAccount = new Map<string, AccountBalance>();

    for (const ob of openingBalances ?? []) {
      byAccount.set(ob.account_id, {
        name: ob.account_name,
        currencyCode: ob.account_currency,
        symbol: ob.account_currency_symbol,
        opening: ob.opening_amount,
        closing: ob.opening_amount,
      });
    }

    for (const tx of txs) {
      for (const line of tx.amounts) {
        const current = byAccount.get(line.account_id);
        if (current) {
          current.closing += line.amount;
        } else {
          byAccount.set(line.account_id, {
            name: line.account_name,
            currencyCode: line.original_currency,
            symbol: line.account_currency_symbol,
            opening: 0,
            closing: line.amount,
          });
        }
      }
    }

    return Array.from(byAccount.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [openingBalances, txs]);

  return { monthSummary, accountMonthlyBalances };
}
