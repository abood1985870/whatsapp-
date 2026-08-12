/**
 * Pagination, clamped in one place.
 *
 * List endpoints took `page` and `limit` straight from the query string and
 * passed them into Prisma. `parseInt("abc", 10)` is NaN, and `skip: NaN` is a
 * Prisma error — a 500 from a malformed URL. `limit=1000000` was accepted as
 * written, so one request could ask for an entire table and hold the connection
 * while Postgres assembled it. `page=-5` produced a negative skip.
 *
 * The defaults are deliberately conservative: a caller who wants more has to
 * paginate, which is the point.
 */
export interface PageArgs {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

export function clampPage(
  rawPage: unknown,
  rawLimit: unknown,
  options: { defaultLimit?: number; maxLimit?: number } = {}
): PageArgs {
  const { defaultLimit = 25, maxLimit = 100 } = options;

  const parsedPage = Number(rawPage);
  const page = Number.isFinite(parsedPage) && parsedPage >= 1 ? Math.floor(parsedPage) : 1;

  const parsedLimit = Number(rawLimit);
  const limit = Number.isFinite(parsedLimit) && parsedLimit >= 1
    ? Math.min(Math.floor(parsedLimit), maxLimit)
    : defaultLimit;

  return { page, limit, skip: (page - 1) * limit, take: limit };
}

/**
 * Escapes one CSV cell.
 *
 * Four export endpoints each rolled their own quoting, and all four broke on
 * the same input: a value containing a comma or a double quote shifted every
 * column after it. A Saudi company name like `شركة "الرواد", المحدودة` is not
 * an edge case, it is a Tuesday.
 *
 * The leading apostrophe on formula characters is deliberate. Excel executes a
 * cell beginning with =, +, - or @, so an exported contact note reading
 * `=HYPERLINK(...)` becomes live content in whoever opens the file. Prefixing
 * neutralises it while leaving the text readable.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';

  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;

  return `"${text.replace(/"/g, '""')}"`;
}

/** Joins one row. Header rows go through the same function. */
export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",");
}
