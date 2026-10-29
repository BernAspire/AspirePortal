import { TZDate } from "@date-fns/tz";
import { format, startOfDay } from "date-fns";

/**
 * Time helpers. Store instants as `timestamptz` (UTC); show them and evaluate
 * business rules (cut-offs, "valid today", expiry) in Singapore time.
 */

export const SINGAPORE_TZ = "Asia/Singapore";

/** The same instant, viewed in Singapore time. */
export function inSingapore(instant: Date | string | number): TZDate {
  return new TZDate(new Date(instant).getTime(), SINGAPORE_TZ);
}

/** Calendar date in Singapore as `YYYY-MM-DD` (matches a Postgres `date`). */
export function singaporeDate(instant: Date | string | number = Date.now()): string {
  return format(inSingapore(instant), "yyyy-MM-dd");
}

/** The UTC instant at which the Singapore day containing `instant` begins. */
export function startOfSingaporeDay(instant: Date | string | number = Date.now()): Date {
  return new Date(startOfDay(inSingapore(instant)).getTime());
}

/** Formats an instant for display in Singapore time, e.g. "Thu 29 Oct 2026, 3:52 pm". */
export function formatSingapore(
  instant: Date | string | number,
  pattern = "EEE d MMM yyyy, h:mm aaa",
): string {
  return format(inSingapore(instant), pattern);
}

/**
 * Whether a validity window (Postgres `date` columns, inclusive) covers the
 * given instant's Singapore calendar date. `validTo` null means open-ended.
 */
export function isWithinValidity(
  validFrom: string,
  validTo: string | null,
  instant: Date | string | number = Date.now(),
): boolean {
  const today = singaporeDate(instant);
  return validFrom <= today && (validTo === null || today <= validTo);
}
