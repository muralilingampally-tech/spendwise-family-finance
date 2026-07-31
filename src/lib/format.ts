export const inr = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value || 0);

export const shortDate = (value: string) => {
  const iso = normalizeDate(value) ?? value;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

export const monthKey = (iso: string) => iso.slice(0, 7);

export const monthLabel = (key: string) => {
  const d = new Date(`${key}-01T00:00:00`);
  return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
};

const pad = (value: number) => String(value).padStart(2, "0");

export const toLocalISODate = (date: Date) => {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  return `${year}-${month}-${day}`;
};

export const todayISO = () => toLocalISODate(new Date());

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const build = (y: number, m: number, d: number): string | null => {
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const year = y < 100 ? (y >= 70 ? 1900 + y : 2000 + y) : y;
  const date = new Date(year, m - 1, d);
  if (date.getFullYear() !== year || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return `${year}-${pad(m)}-${pad(d)}`;
};

/**
 * Canonicalises any reasonable date input to yyyy-MM-dd — the single format the
 * app stores and compares. Accepts yyyy-mm-dd, dd/mm/yyyy, mm/dd/yyyy (only when
 * unambiguous), dd-mmm-yyyy, "31 Jul 2026", ISO timestamps and Excel serials.
 * Ambiguous slash/dot/dash numeric dates are read day-first (Indian convention).
 */
export function normalizeDate(input: unknown): string | null {
  if (input == null) return null;

  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : toLocalISODate(input);
  }

  // Excel/Sheets serial number (days since 1899-12-30).
  if (typeof input === "number" && Number.isFinite(input)) {
    if (input < 1 || input > 80000) return null;
    return toLocalISODate(new Date(Date.UTC(1899, 11, 30 + Math.floor(input))));
  }

  const raw = String(input).trim();
  if (!raw) return null;

  // Numeric-only Excel serial pasted as text.
  if (/^\d{5}$/.test(raw)) return normalizeDate(Number(raw));

  // yyyy-mm-dd (optionally with a time part) or yyyy/mm/dd.
  let m = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (m) return build(Number(m[1]), Number(m[2]), Number(m[3]));

  // d/m/yyyy, d-m-yy, d.m.yyyy — day-first, but fall back to month-first when
  // the first part cannot be a day (e.g. 12/31/2026).
  m = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = Number(m[3]);
    return build(y, b, a) ?? build(y, a, b);
  }

  // 31 Jul 2026 / 31-Jul-26 / Jul 31, 2026 / July 2026 31
  m = raw.match(/^(\d{1,2})[\s\-/]*([A-Za-z]{3,9})[\s\-/,]*(\d{2,4})$/);
  if (m) return build(Number(m[3]), MONTHS[m[2].toLowerCase()] ?? 0, Number(m[1]));

  m = raw.match(/^([A-Za-z]{3,9})[\s\-/]*(\d{1,2})[\s\-/,]*(\d{2,4})$/);
  if (m) return build(Number(m[3]), MONTHS[m[1].toLowerCase()] ?? 0, Number(m[2]));

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : toLocalISODate(parsed);
}