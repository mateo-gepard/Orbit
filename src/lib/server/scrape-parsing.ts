/**
 * Pure parsing helpers for the product scraper, kept out of the route handler
 * so they can be tested directly.
 */

/**
 * Decode an HTML numeric character reference.
 *
 * `String.fromCharCode` only reaches U+FFFF — anything above it (emoji, most
 * pictographs) came back as garbage, which is exactly what a scraped product
 * title tends to contain. `fromCodePoint` handles the full range; invalid or
 * out-of-range values are left as the original text rather than throwing.
 */
export function decodeNumericEntity(raw: string, codePoint: number): string {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return raw;
  // Surrogate halves are not valid on their own.
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) return raw;
  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return raw;
  }
}

/**
 * A money amount with optional thousands grouping and a two-digit fraction.
 *
 * Written as a source string so the currency patterns can embed it. A bare
 * `\d{1,6}[.,]\d{2}` matched only the tail of a grouped amount: on `1.234,56`
 * it captured `1.23`, silently reporting a €1.23 price for a €1,234.56
 * product.
 */
export const AMOUNT_PATTERN = String.raw`(?:\d{1,3}(?:[.,]\d{3})+|\d{1,6})[.,]\d{2}`;

/**
 * Normalise a scraped price into `1234.56` form.
 *
 * The previous one-liner stripped non-numerics and replaced only the *first*
 * comma, so the German default `1.234,56` became `1.234.56` and failed the
 * final numeric guard — the price came back undefined on precisely the sites
 * the scraper sends a `de-DE` Accept-Language for.
 *
 * The rule: the last separator in the string is the decimal separator, unless
 * it is the only separator and exactly three digits follow it, in which case
 * it is a thousands group (`1.234` and `1,234` are both 1234).
 */
export function normalizePrice(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/[^\d.,]/g, '');
  if (!cleaned || !/\d/.test(cleaned)) return undefined;

  const decimalIndex = Math.max(cleaned.lastIndexOf(','), cleaned.lastIndexOf('.'));
  if (decimalIndex === -1) return cleaned;

  const integerPart = cleaned.slice(0, decimalIndex);
  const fraction = cleaned.slice(decimalIndex + 1);
  if (!integerPart) return undefined;

  const hasOtherSeparator = /[.,]/.test(integerPart);
  if (!hasOtherSeparator && fraction.length === 3) {
    // A single separator with a full three-digit group is thousands.
    return `${integerPart}${fraction}`;
  }

  if (!/^\d{1,2}$/.test(fraction)) return undefined;
  return `${integerPart.replace(/[.,]/g, '')}.${fraction}`;
}
