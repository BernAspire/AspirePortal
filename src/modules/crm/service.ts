/** The name to greet someone by: their preferred name, else the first word of their full name. */
export function displayName(fullName: string, preferredName: string | null): string {
  const preferred = preferredName?.trim();
  if (preferred) return preferred;
  const first = fullName.trim().split(/\s+/)[0];
  return first || "there";
}
