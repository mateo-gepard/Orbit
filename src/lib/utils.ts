import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Standardized date format constants
export const DATE_FORMAT_FULL = 'MMM d, yyyy · HH:mm';
export const DATE_FORMAT_SHORT = 'dd MMM';

export function formatTimestamp(timestamp: number, fmt: string = DATE_FORMAT_FULL): string {
  return format(new Date(timestamp), fmt);
}
