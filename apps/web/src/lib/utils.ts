import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind sınıflarını çakışmasız birleştirir */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Klavye kısayolu etiketi: platforma göre ⌘ / Ctrl */
export function modKey(): string {
  if (typeof navigator === 'undefined') return '⌘';
  return /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
}
