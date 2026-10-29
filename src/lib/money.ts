/**
 * Money helpers. All amounts are integer cents; floats are never used for money.
 *
 * The database stores cents as `bigint`. In TypeScript we carry them as
 * `number`, guarded to be safe integers (up to ~90 trillion dollars), and do
 * multiplication in `bigint` so rounding is exact.
 */

export type Cents = number;

/** ISO 4217 currency codes the platform supports. */
export type Currency = "SGD";

export interface Money {
  readonly cents: Cents;
  readonly currency: Currency;
}

const BASIS_POINTS = 10_000n;

export function assertCents(value: number): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Expected an integer number of cents, got ${value}`);
  }
  return value;
}

/**
 * Multiplies `cents` by `numerator / denominator` and rounds half away from
 * zero (half-up for positive amounts, mirrored for credits/refunds).
 */
function mulDivRoundHalfUp(cents: bigint, numerator: bigint, denominator: bigint): bigint {
  const product = cents * numerator;
  const negative = product < 0n;
  const abs = negative ? -product : product;
  const rounded = (abs * 2n + denominator) / (denominator * 2n);
  return negative ? -rounded : rounded;
}

/**
 * GST on a single line, rounded half-up to the cent.
 *
 * @param netCents  line amount before GST, in cents
 * @param rateBasisPoints  GST rate in basis points (9% = 900). Comes from the
 *   centre's settings, never hard-coded at the call site.
 */
export function gstForLine(netCents: Cents, rateBasisPoints: number): Cents {
  assertCents(netCents);
  if (!Number.isSafeInteger(rateBasisPoints) || rateBasisPoints < 0) {
    throw new RangeError(`Invalid GST rate in basis points: ${rateBasisPoints}`);
  }
  const gst = mulDivRoundHalfUp(BigInt(netCents), BigInt(rateBasisPoints), BASIS_POINTS);
  return assertCents(Number(gst));
}

export interface LineTotals {
  readonly netCents: Cents;
  readonly gstCents: Cents;
  readonly grossCents: Cents;
}

/** Net, GST and gross for one line. GST is computed per line, not per invoice. */
export function lineTotals(netCents: Cents, rateBasisPoints: number): LineTotals {
  const gstCents = gstForLine(netCents, rateBasisPoints);
  return { netCents, gstCents, grossCents: assertCents(netCents + gstCents) };
}

/** Sums per-line totals into invoice totals. */
export function sumLines(lines: readonly LineTotals[]): LineTotals {
  let net = 0n;
  let gst = 0n;
  for (const line of lines) {
    net += BigInt(assertCents(line.netCents));
    gst += BigInt(assertCents(line.gstCents));
  }
  const netCents = assertCents(Number(net));
  const gstCents = assertCents(Number(gst));
  return { netCents, gstCents, grossCents: assertCents(netCents + gstCents) };
}

/** Parses a user-entered dollar string ("12", "12.5", "12.50") into cents without floats. */
export function parseDollars(input: string): Cents {
  const match = /^\s*(-)?(\d{1,13})(?:\.(\d{1,2}))?\s*$/.exec(input);
  if (!match) {
    throw new RangeError(`Not a valid dollar amount: "${input}"`);
  }
  const [, sign, dollars, fraction = ""] = match;
  const cents = BigInt(dollars) * 100n + BigInt(fraction.padEnd(2, "0") || "0");
  return assertCents(Number(sign ? -cents : cents));
}

/** Formats cents for display, e.g. 123456 → "S$1,234.56". */
export function formatMoney(cents: Cents, currency: Currency = "SGD"): string {
  assertCents(cents);
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.trunc(abs / 100);
  const remainder = abs % 100;
  const grouped = dollars.toLocaleString("en-SG");
  const symbol = currency === "SGD" ? "S$" : `${currency} `;
  return `${negative ? "-" : ""}${symbol}${grouped}.${remainder.toString().padStart(2, "0")}`;
}
