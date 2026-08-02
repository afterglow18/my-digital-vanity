import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Resolve an image path to a displayable URL.
 *
 * Local-first storage always uses data URLs directly, so this is
 * effectively an identity function for data URLs. Null/undefined → null.
 */
export function getImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return path; // Data URLs are already display-ready
}
