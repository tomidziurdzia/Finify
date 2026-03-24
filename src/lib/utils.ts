import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a numeric string with dot thousand separators (es-AR style).
 * User types comma for decimals. Example: "111111,55" → "111.111,55"
 * Optional maxDecimals truncates the decimal part (e.g. 3 for fiat, 7 for crypto).
 */
export function formatNumberInput(value: string, maxDecimals?: number): string {
  // Allow only digits, comma (decimal), and minus
  const cleaned = value.replace(/[^\d,-]/g, "");

  const [intPart, ...decParts] = cleaned.split(",");
  let decPart = decParts.length > 0 ? decParts.join("") : null;

  // Truncate decimals if maxDecimals is set
  if (decPart !== null && maxDecimals !== undefined) {
    decPart = decPart.slice(0, maxDecimals);
  }

  // Format integer part with dots as thousand separators
  const sign = intPart.startsWith("-") ? "-" : "";
  const digits = intPart.replace("-", "");
  const formatted = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  if (decPart !== null) {
    return `${sign}${formatted},${decPart}`;
  }
  return `${sign}${formatted}`;
}

/**
 * Convert a number to es-AR formatted string without forcing trailing zeros.
 * Example: 1234.5 → "1.234,5", 100 → "100"
 */
export function numberToInputString(value: number): string {
  const str = String(value);
  const [intStr, decStr] = str.split(".");
  const sign = intStr.startsWith("-") ? "-" : "";
  const digits = intStr.replace("-", "");
  const formatted = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  if (decStr) {
    return `${sign}${formatted},${decStr}`;
  }
  return `${sign}${formatted}`;
}

/**
 * Parse a formatted numeric string back to a number.
 * Removes dots (thousands) and converts comma to dot (decimal).
 */
export function parseNumberInput(value: string): number {
  const cleaned = value.replace(/\./g, "").replace(",", ".");
  const result = parseFloat(cleaned);
  return isFinite(result) ? result : 0;
}
