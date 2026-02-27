/**
 * Shared formatting utilities for Finify.
 * Used across BudgetPage, TransactionsTable, Dashboard, etc.
 */

/** Month names in Spanish (0-indexed: MONTH_NAMES[0] = "Enero") */
export const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

const amountFormatter = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format a number as es-AR currency (dot thousands, comma decimals, 2 places). */
export function formatAmount(value: number): string {
  return amountFormatter.format(value);
}

/** Return a Tailwind text color class based on the sign of a number. */
export function amountTone(value: number): string {
  if (value > 0) return "text-green-600";
  if (value < 0) return "text-red-600";
  return "text-muted-foreground";
}

/**
 * Parse a money string in es-AR format (e.g. "1.234,56" or "$1.234,56") to a number.
 * Returns null if the input is empty or invalid.
 */
export function parseMoneyInput(value: string): number | null {
  const normalized = value
    .trim()
    .replace(/\s/g, "")
    .replace(/\$/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");

  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Format a raw money input string by parsing and re-formatting it. */
export function formatMoneyInput(value: string): string {
  const parsed = parseMoneyInput(value);
  if (parsed == null) return "";
  return formatAmount(parsed);
}

/** Hex colors for each budget category type, used across charts. */
export const CATEGORY_COLORS: Record<string, string> = {
  income: "#16a34a",
  essential_expenses: "#dc2626",
  discretionary_expenses: "#ea580c",
  debt_payments: "#e11d48",
  savings: "#0891b2",
  investments: "#4f46e5",
};
