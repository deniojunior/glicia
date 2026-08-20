/** Unicode-safe key used by the food-resolution domain. */
export function normalizeKey(raw: string): string {
  return raw.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Splits an already-normalized key into meaningful whitespace-delimited tokens. */
export function tokenize(normalizedKey: string): string[] {
  return normalizedKey.split(/\s+/).filter((token) => token.length > 0);
}
