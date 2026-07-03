import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * ShadCN `cn()` helper — merges Tailwind classes with conflict resolution.
 * Use anywhere you'd otherwise build a className from conditional fragments:
 *   cn("base", isActive && "bg-accent", className)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}