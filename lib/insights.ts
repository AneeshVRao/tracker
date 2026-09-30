import type { DB } from './db';
import { norm } from './parse';
import { nextDeadline } from './rules';
import type { Listed } from './today';

const DAY = 86_400_000;
const PRIORITY = ['', 'Low', 'Medium', 'High'];

export type StatRow = { key: string; sent: number; linkedinSent: number; accepted: number; replied: number; medianDays: number | null };
type Raw = {
  priority: number; degree: string | null; country: string | null; project_tag: string | null; extra: string;
  list_name: string; channel: 'email' | 'linkedin'; sent_at: string | null; replied_at: string | null; accepted: number;
};

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function statsBy(db: DB, dim: string): StatRow[] {
  const rows = db.prepare(`SELECT c.priority, c.degree, c.country, c.project_tag, c.extra, l.name AS list_name, l.channel,
      (SELECT MIN(at) FROM events e WHERE e.contact_id = c.id AND e.type = 'sent' AND e.reverted = 0) AS sent_at,
      (SELECT MIN(at) FROM events e WHERE e.contact_id = c.id AND e.type = 'replied' AND e.reverted = 0) AS replied_at,
      EXISTS (SELECT 1 FROM events e WHERE e.contact_id = c.id AND e.type = 'accepted' AND e.reverted = 0) AS accepted
    FROM contacts c JOIN lists l ON l.id = c.list_id WHERE l.kind = 'contacts'`).all() as Raw[];
  const keyOf = (r: Raw): string => {
    if (dim === 'list') return r.list_name;
    if (dim === 'project') return r.project_tag ?? '(none)';
    if (dim === 'priority') return PRIORITY[r.priority] ?? String(r.priority);
    if (dim === 'degree') return r.degree ?? '(unknown)';
    if (dim === 'country') return r.country ?? '(unknown)';
    if (dim.startsWith('col:')) {
      const name = dim.slice(4);
      const o = JSON.parse(r.extra) as Record<string, unknown>;
      const v = Object.hasOwn(o, name) ? o[name] : undefined;
      return typeof v === 'string' && v ? v : '(blank)';
    }
    return 'All';
  };
  const groups = new Map<string, { row: StatRow; days: number[] }>();
  for (const r of rows) {
    if (!r.sent_at) continue;
    const k = keyOf(r);
    const g = groups.get(k) ?? { row: { key: k, sent: 0, linkedinSent: 0, accepted: 0, replied: 0, medianDays: null }, days: [] };
    g.row.sent++;
    if (r.channel === 'linkedin') { g.row.linkedinSent++; if (r.accepted) g.row.accepted++; }
    if (r.replied_at) { g.row.replied++; g.days.push(Math.max(0, Math.round((Date.parse(r.replied_at) - Date.parse(r.sent_at)) / DAY))); }
    groups.set(k, g);
  }
  return [...groups.values()]
    .map(g => ({ ...g.row, medianDays: median(g.days) }))
    .sort((a, b) => b.sent - a.sent || a.key.localeCompare(b.key));
}

export type IntroContact = Listed & { asked_at: string | null };

export function introGroups(db: DB): { mutual: string; contacts: IntroContact[] }[] {
  const rows = db.prepare(`SELECT c.*, l.name AS list_name, l.channel,
      (SELECT MAX(at) FROM events e WHERE e.contact_id = c.id AND e.type = 'intro_requested' AND e.reverted = 0) AS asked_at
    FROM contacts c JOIN lists l ON l.id = c.list_id
    WHERE l.kind = 'contacts' AND c.mutual IS NOT NULL AND c.status IN ('to_contact','sent') ORDER BY c.list_id, c.source_row, c.id`).all() as IntroContact[];
  const groups = new Map<string, { mutual: string; contacts: IntroContact[] }>();
  for (const r of rows) {
    const k = norm(r.mutual);
    if (!k) continue;
    const g = groups.get(k) ?? { mutual: r.mutual!.trim(), contacts: [] };
    g.contacts.push(r);
    groups.set(k, g);
  }
  return [...groups.values()].sort((a, b) => b.contacts.length - a.contacts.length || a.mutual.localeCompare(b.mutual));
}

export type RefDeadline = { id: number; name: string; org: string | null; list_name: string; deadline_text: string | null; next: string | null; days: number | null; url: string | null };

export function referenceDeadlines(db: DB, today: string): RefDeadline[] {
  const rows = db.prepare(`SELECT c.id, c.name, c.org, c.deadline_text, c.deadline_dates, c.deadline_manual, c.extra, l.name AS list_name
    FROM contacts c JOIN lists l ON l.id = c.list_id WHERE l.kind = 'reference' ORDER BY c.list_id, c.source_row`).all() as
    { id: number; name: string; org: string | null; deadline_text: string | null; deadline_dates: string; deadline_manual: string | null; extra: string; list_name: string }[];
  return rows.map(r => {
    const next = nextDeadline(JSON.parse(r.deadline_dates), r.deadline_manual, today);
    const extra = JSON.parse(r.extra) as Record<string, string>;
    const url = Object.entries(extra).find(([k, v]) => /^(url|link|website)$/i.test(k.trim()) && /^https?:\/\//i.test(v))?.[1] ?? null;
    return {
      id: r.id, name: r.name, org: r.org, list_name: r.list_name, deadline_text: r.deadline_text, url, next,
      days: next ? Math.round((Date.parse(next) - Date.parse(today)) / DAY) : null,
    };
  }).sort((a, b) => (a.next === null ? 1 : 0) - (b.next === null ? 1 : 0) || (a.next ?? '').localeCompare(b.next ?? ''));
}
