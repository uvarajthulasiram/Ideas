// All money is an integer count of the currency's minor unit (cents for USD and CAD).
// Percentages are applied with exact integer maths and rounded half up.

export type Minor = number;

export function assertMinor(amount: number): asserts amount is Minor {
  if (!Number.isSafeInteger(amount)) throw new RangeError(`Money must be an integer of minor units: ${amount}`);
}

export function isValidCurrency(code: string): boolean {
  return /^[A-Z]{3}$/.test(code) && Intl.supportedValuesOf("currency").includes(code);
}

/** Decimal places of the currency's minor unit: 2 for USD and CAD, 0 for JPY. */
export function minorUnitDigits(currency: string): number {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

/** Converts a major-unit amount typed by a person (e.g. 125.5 dollars) to minor units. */
export function toMinor(major: number, currency: string): Minor {
  return Math.round(major * 10 ** minorUnitDigits(currency));
}

export function formatMoney(amount: Minor, currency: string, locale: string): string {
  assertMinor(amount);
  const digits = minorUnitDigits(currency);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount / 10 ** digits);
}

/** Percentages may have up to 3 decimals (e.g. 10.355%). */
const PERCENT_SCALE = 1000;

export function hasAtMostThreeDecimals(percent: number): boolean {
  return Math.abs(percent * PERCENT_SCALE - Math.round(percent * PERCENT_SCALE)) < 1e-6;
}

/** `percent`% of `amount`, rounded half up (away from zero) to a whole minor unit. */
export function percentOf(amount: Minor, percent: number): Minor {
  assertMinor(amount);
  if (!hasAtMostThreeDecimals(percent)) throw new RangeError(`Percent has more than 3 decimals: ${percent}`);
  const scaled = Math.round(percent * PERCENT_SCALE);
  const divisor = 100 * PERCENT_SCALE;
  const product = Math.abs(amount * scaled);
  if (!Number.isSafeInteger(product)) throw new RangeError(`Amount too large: ${amount}`);
  const whole = Math.floor(product / divisor);
  const rounded = (product - whole * divisor) * 2 >= divisor ? whole + 1 : whole;
  return amount * scaled < 0 ? -rounded : rounded;
}
