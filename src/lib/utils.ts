import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a phone number to (xxx) xxx-xxxx format
 * Handles various input formats and strips non-numeric characters
 */
export function formatPhoneNumber(phone: string | undefined | null): string {
  if (!phone) return "";
  
  // Remove all non-numeric characters
  const digits = phone.replace(/\D/g, "");
  
  // Handle different lengths
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  
  // Handle 11 digits (with leading 1 for US)
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  
  // For other lengths, return original cleaned up
  return phone.trim();
}

/**
 * Format phone number as user types (for input fields)
 * Returns formatted string for display
 */
export function formatPhoneInput(value: string): string {
  // Remove all non-numeric characters
  const digits = value.replace(/\D/g, "");
  
  // Limit to 10 digits
  const limited = digits.slice(0, 10);
  
  // Format progressively as user types
  if (limited.length === 0) return "";
  if (limited.length <= 3) return `(${limited}`;
  if (limited.length <= 6) return `(${limited.slice(0, 3)}) ${limited.slice(3)}`;
  return `(${limited.slice(0, 3)}) ${limited.slice(3, 6)}-${limited.slice(6)}`;
}
