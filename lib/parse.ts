export type EmailConfidence = 'verified' | 'inferred' | 'unknown';
export type ImportStatus = 'to_contact' | 'sent' | 'replied' | 'skipped';

const str = (v: unknown) => (v == null ? '' : String(v));
export const norm = (v: unknown) => str(v).trim().toLowerCase().replace(/\s+/g, ' ');

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;

export function parseEmail(cell: unknown): { email: string | null; confidence: EmailConfidence | null } {
  const text = str(cell);
  const m = text.match(EMAIL_RE);
  if (!m) return { email: null, confidence: null };
  const up = text.toUpperCase();
  const v = up.search(/\bVERIFIED\b/);
  const i = up.indexOf('INFERRED');
  const confidence: EmailConfidence =
    v < 0 && i < 0 ? 'unknown' : i < 0 || (v >= 0 && v < i) ? 'verified' : 'inferred';
  return { email: m[0].toLowerCase(), confidence };
}

export function normLinkedIn(cell: unknown): string | null {
  const m = str(cell).match(/linkedin\.com\/in\/([^/?#\s]+)/i);
  if (!m) return null;
  let slug = m[1];
  try { slug = decodeURIComponent(slug); } catch { /* malformed %-escape: keep raw */ }
  return `https://www.linkedin.com/in/${slug.toLowerCase()}`;
}

const PRIORITY: Record<string, 1 | 2 | 3> = { strong: 3, high: 3, moderate: 2, medium: 2, weak: 1, low: 1 };
export function parsePriority(cell: unknown): 1 | 2 | 3 {
  return PRIORITY[norm(cell).match(/^[a-z]+/)?.[0] ?? ''] ?? 2;
}

export function parseDegree(cell: unknown): { degree: string | null; mutual: string | null } {
  const s = str(cell).trim();
  const degree = /^1st/i.test(s) ? '1st' : /^2nd/i.test(s) ? '2nd' : /^3rd/i.test(s) ? '3rd+' : null;
  const m = s.match(/mutual:\s*(.+)$/i);
  return { degree, mutual: m ? m[1].trim() : null };
}

// ---- deadlines -------------------------------------------------------------
const MON = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const D = '(\\d{1,2})(?:st|nd|rd|th)?';
const monthIdx = (m: string) => ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m.slice(0, 3).toLowerCase()) + 1;

function iso(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
}
const yearAfter = (after: string) => Number(after.match(/\b(20\d{2})\b/)?.[1] ?? NaN);

// Order matters: ranges and full dates are consumed (blanked) before yearless fallbacks run.
const DATE_RULES: [RegExp, (m: string[], after: string) => string | null][] = [
  [new RegExp(`\\b${D}\\s+${MON}\\s*[-–]\\s*${D}\\s+${MON},?\\s+(\\d{4})\\b`, 'gi'), m => iso(+m[5], monthIdx(m[4]), +m[3])], // 16 Mar - 3 Apr 2026
  [new RegExp(`\\b${MON}\\s+${D}\\s*[-–]\\s*${D},?\\s+(\\d{4})\\b`, 'gi'), m => iso(+m[4], monthIdx(m[1]), +m[3])], // Feb 02-22, 2026
  [new RegExp(`\\b${MON}\\s+${D},?\\s+(\\d{4})\\b`, 'gi'), m => iso(+m[3], monthIdx(m[1]), +m[2])], // Sep 29th, 2026
  [new RegExp(`\\b${D}\\s+${MON},?\\s+(\\d{4})\\b`, 'gi'), m => iso(+m[3], monthIdx(m[2]), +m[1])], // 30 November 2026
  [/\b(\d{4})-(\d{2})-(\d{2})\b/g, m => iso(+m[1], +m[2], +m[3])], // 2026-09-25
  [new RegExp(`\\b${MON}\\s+${D}\\b`, 'gi'), (m, after) => iso(yearAfter(after), monthIdx(m[1]), +m[2])], // Nov 10 … 2026
  [new RegExp(`\\b${D}\\s+${MON}\\b`, 'gi'), (m, after) => iso(yearAfter(after), monthIdx(m[2]), +m[1])], // 10 November … 2026
];

export function parseDeadlines(cell: unknown): string[] {
  let text = str(cell);
  const found = new Set<string>();
  for (const [re, toIso] of DATE_RULES) {
    text = text.replace(re, (...args: unknown[]) => {
      const offset = args[args.length - 2] as number;
      const whole = args[args.length - 1] as string;
      const m = args.slice(0, -2) as string[];
      const d = toIso(m, whole.slice(offset + m[0].length));
      if (d) found.add(d);
      return ' '.repeat(m[0].length);
    });
  }
  return [...found].sort();
}

// ---- status / keys ---------------------------------------------------------
export function mapStatus(cell: unknown): ImportStatus {
  const s = norm(cell);
  if (/^(dropped|skip|do not contact)/.test(s)) return 'skipped';
  if (/^(replied|responded)/.test(s)) return 'replied';
  if (/^sent/.test(s)) return 'sent';
  return 'to_contact';
}

export function detectProject(message: string | null, projects: string[]): string | null {
  const m = norm(message);
  return projects.find(p => m.includes(p.toLowerCase())) ?? null;
}

export const nameOrgKey = (name: string, org: string | null) => `${norm(name)}|${norm(org)}`;

export const personKey = (c: { linkedin_url: string | null; email: string | null; name: string; org: string | null }) =>
  c.linkedin_url ?? c.email ?? nameOrgKey(c.name, c.org);
