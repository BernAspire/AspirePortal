/** The name to greet someone by: their preferred name, else the first word of their full name. */
export function displayName(fullName: string, preferredName: string | null): string {
  const preferred = preferredName?.trim();
  if (preferred) return preferred;
  const first = fullName.trim().split(/\s+/)[0];
  return first || "there";
}

/** Up to two initials for an avatar, e.g. "Chloe Tan" → "CT", "Aisha" → "A". */
export function initials(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}
