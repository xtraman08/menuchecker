// Menu prices are free text as printed ("$14", "14.50", "ETB 250", "MP").
// The shortlist total is a best-effort sum of the ones we can read.

export function parsePrice(price: string | null | undefined): number | null {
  if (!price) return null;
  const m = price.replace(/,(?=\d{3}\b)/g, '').match(/\d+(?:[.,]\d{1,2})?/);
  if (!m) return null;
  const n = Number(m[0].replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function currencyAffixes(price: string): { prefix: string; suffix: string } {
  const m = price.match(/^([^\d]*)\d[\d.,]*(.*)$/);
  return { prefix: (m?.[1] ?? '').trimStart(), suffix: (m?.[2] ?? '').trimEnd() };
}

export interface Total {
  amount: number;
  /** Formatted with the currency style of the first priced item, e.g. "$32" or "ETB 250". */
  label: string;
  unpriced: number;
}

export function totalOf(prices: (string | null)[]): Total {
  let amount = 0;
  let unpriced = 0;
  let style: string | null = null;
  for (const p of prices) {
    const n = parsePrice(p);
    if (n === null) {
      unpriced++;
      continue;
    }
    amount += n;
    style ??= p;
  }
  const { prefix, suffix } = style ? currencyAffixes(style) : { prefix: '', suffix: '' };
  const num = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return { amount, label: `${prefix}${num}${suffix}`, unpriced };
}
