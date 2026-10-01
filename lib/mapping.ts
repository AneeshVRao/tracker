import { parseEmail } from './parse';
import type { Channel } from './rules';

export const FIELDS = ['name', 'org', 'role', 'country', 'email', 'linkedin_url', 'message', 'priority', 'degree', 'deadline', 'status', 'sent_date'] as const;
export type Field = (typeof FIELDS)[number];
export type ExcludeRule = { column: string; contains: string };
export type Mapping = Partial<Record<Field, string>> & { exclude?: ExcludeRule };

export const FIELD_LABEL: Record<Field, string> = {
  name: 'Name', org: 'Organisation', role: 'Role / title', country: 'Country', email: 'Email',
  linkedin_url: 'LinkedIn URL', message: 'Message / note', priority: 'Priority / fit', degree: 'Degree / mutuals',
  deadline: 'Deadline', status: 'Existing status', sent_date: 'Date sent',
};

// Synonyms in precedence order; a header containing any negative term is never picked for that field.
const RULES: Record<Field, { syn: string[]; neg?: string[] }> = {
  name: { syn: ['full name', 'name', 'programme', 'program'], neg: ['company', 'file'] },
  org: { syn: ['current company', 'company', 'institute/university', 'institute', 'university', 'host'], neg: ['signal', 'type'] },
  role: { syn: ['current title', 'title', 'position/seniority', 'position'] },
  country: { syn: ['country'] },
  email: { syn: ['email (verified vs inferred)', 'email'], neg: ['status', 'angle'] },
  linkedin_url: { syn: ['linkedin profile url', 'linkedin url', 'linkedin'], neg: ['status', 'headline', 'note'] },
  message: { syn: ['connection note', 'linkedin connection request note', 'specific email angle', 'email angle'], neg: ['visa', 'notes'] },
  priority: { syn: ['fit rating', 'priority'], neg: ['basis'] },
  degree: { syn: ['degree / mutuals', 'degree'] },
  deadline: { syn: ['application deadline', 'deadline'] },
  status: { syn: ['outreach status', 'status'], neg: ['paper', 'read', 'email', 'linkedin', 'what the headline'] },
  sent_date: { syn: ['date sent'] },
};

const lc = (h: string) => h.trim().toLowerCase();
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const hasWord = (h: string, w: string) => new RegExp(`(^|[^a-z0-9])${esc(w)}($|[^a-z0-9])`).test(h);

export function guessMapping(headers: string[]): Mapping {
  const m: Mapping = {};
  for (const f of FIELDS) {
    const { syn, neg = [] } = RULES[f];
    const ok = headers.filter(h => h.trim() && !neg.some(n => hasWord(lc(h), n)));
    const hit = syn.map(s => ok.find(h => lc(h) === s)).find(Boolean) ?? syn.map(w => ok.find(h => hasWord(lc(h), w))).find(Boolean);
    if (hit) m[f] = hit;
  }
  return m;
}

export const guessKind = (sheetName: string): 'contacts' | 'reference' => (/programme|program/i.test(sheetName) ? 'reference' : 'contacts');

export const guessInclude = (sheetName: string, rowCount: number) =>
  rowCount > 0 && !/read ?me|summary|audit|excluded|template|institution/i.test(sheetName);

export function guessChannel(rows: Record<string, string>[], m: Mapping): Channel {
  const col = m.email;
  if (!col || rows.length === 0) return 'linkedin';
  return rows.filter(r => parseEmail(r[col]).email).length / rows.length >= 0.5 ? 'email' : 'linkedin';
}

const MARKERS = ['FAILS CUTOFF', 'DO NOT CONTACT'];
export function guessExclude(headers: string[], rows: Record<string, string>[]): ExcludeRule | undefined {
  for (const marker of MARKERS)
    for (const h of headers)
      if (rows.some(r => (r[h] ?? '').toUpperCase().startsWith(marker))) return { column: h, contains: marker };
  return undefined;
}
