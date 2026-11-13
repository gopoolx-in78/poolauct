/**
 * RFC 4180 CSV with spreadsheet formula-injection protection: text cells starting with = + - @ tab or CR are
 * prefixed with an apostrophe so spreadsheet apps treat them as text. Numbers (e.g. paise) are written as-is.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  let s = typeof value === "string" ? value : JSON.stringify(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[], columns?: readonly string[]): string {
  const cols = columns ?? (rows[0] ? Object.keys(rows[0]) : []);
  const lines = [cols.map(csvCell).join(",")];
  for (const row of rows) lines.push(cols.map((c) => csvCell(row[c])).join(","));
  return lines.join("\r\n") + "\r\n";
}
