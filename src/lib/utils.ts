import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a numeric string with dot thousand separators (es-AR style).
 * User types comma for decimals. Example: "111111,55" → "111.111,55"
 */
export function formatNumberInput(value: string): string {
  // Allow only digits, comma (decimal), and minus
  const cleaned = value.replace(/[^\d,-]/g, "");

  const [intPart, ...decParts] = cleaned.split(",");
  const decPart = decParts.length > 0 ? decParts.join("") : null;

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
 * Parse a formatted numeric string back to a number.
 * Removes dots (thousands) and converts comma to dot (decimal).
 */
export function parseNumberInput(value: string): number {
  const cleaned = value.replace(/\./g, "").replace(",", ".");
  return parseFloat(cleaned);
}
