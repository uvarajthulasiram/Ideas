// Display formatting. Pure functions: client components get the currency and
// locale as props and never import the site config (it holds private details).

import { formatMoney } from "@direct-booking/core";

export interface Locale {
  currency: string;
  locale: string;
}

export const money = (minor: number, l: Locale) => formatMoney(minor, l.currency, l.locale);

/** "Fri, Nov 20" (or with the year when asked). */
export function shortDate(iso: string, locale: string, withYear = false): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: withYear ? "numeric" : undefined,
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
}

export function longDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
