import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { getCachedImageUrl } from "./imageStorage";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Returns a displayable URL for a clothing item's image.
 * Reads from the in-memory URL cache populated at upload time (web) or
 * app startup (native iOS via warmImageUrls).
 * Returns null if the filename is empty or not yet warmed.
 */
export function getImageUrl(filename: string | null | undefined): string | null {
  return getCachedImageUrl(filename);
}
