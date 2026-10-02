import type { Contact, DB } from './db';
import { norm } from './parse';
import { addDays, nextDeadline, OPEN_STATUSES, todayIn, type Settings } from './rules';

const DAY = 86_400_000;
export const OPEN_SQL = `(${OPEN_STATUSES.map(s => `'${s}'`).join(',')})`;

export type Listed = Contact & { list_name: string; channel: 'email' | 'linkedin' };
export type DueKind = 'nudge' | 'close_stale' | 'message_after_accept' | 'withdraw' | 'check_in';
export type QueueItem = Listed & { next_deadline: string | null; dup_list: string | null };

const LISTED = "SELECT c.*, l.name AS list_name, l.channel FROM contacts c JOIN lists l ON l.id = c.list_id WHERE l.kind = 'contacts'";

export function activityStats(db: DB, now: Date, cfg: Settings) {
  const since = new Date(now.getTime() - 7 * DAY).toISOString();
  const rows = db.prepare(`SELECT e.type, e.at, l.channel FROM events e JOIN contacts c ON c.id = e.contact_id JOIN lists l ON l.id = c.list_id
    WHERE e.reverted = 0 AND e.type IN ('sent','replied') AND e.at >= ?`).all(since) as { type: string; at: string; channel: string }[];
  const today = todayIn(cfg.my_timezone, now);
  return {
    invitesWeek: rows.filter(r => r.type === 'sent' && r.channel === 'linkedin').length,
    cap: cfg.weekly_invite_cap,
    sentToday: rows.filter(r => r.type === 'sent' && todayIn(cfg.my_timezone, new Date(r.at)) === today).length,
    repliesWeek: rows.filter(r => r.type === 'replied').length,
  };
}

export function orgsSentToday(db: DB, now: Date, cfg: Settings): Map<string, number> {
  const since = new Date(now.getTime() - 2 * DAY).toISOString(); // any "today" in any timezone lies within 2 days
  const rows = db.prepare(`SELECT c.org, e.at FROM events e JOIN contacts c ON c.id = e.contact_id
    WHERE e.reverted = 0 AND e.type = 'sent' AND e.at >= ? AND c.org IS NOT NULL`).all(since) as { org: string; at: string }[];
  const today = todayIn(cfg.my_timezone, now);
  const m = new Map<string, number>();
  for (const r of rows) if (todayIn(cfg.my_timezone, new Date(r.at)) === today) m.set(norm(r.org), (m.get(norm(r.org)) ?? 0) + 1);
  return m;
}

export function dueFollowUps(db: DB, today: string): (Listed & { due: DueKind })[] {
  const rows = db.prepare(`${LISTED} AND c.follow_up_on IS NOT NULL AND c.follow_up_on <= ? AND c.status IN ('sent','accepted','conversation')
    ORDER BY c.follow_up_on, c.id`).all(today) as Listed[];
  return rows.map(r => ({
    ...r,
    due: r.status === 'accepted' ? 'message_after_accept'
      : r.status === 'conversation' ? 'check_in'
      : r.channel === 'linkedin' ? 'withdraw'
      : r.followup_step >= 3 ? 'close_stale' : 'nudge',
  }));
}

export const repliesWaiting = (db: DB) =>
  db.prepare(`${LISTED} AND c.status = 'replied' ORDER BY c.last_touch_at, c.id`).all() as Listed[];

export function upcomingDeadlines(db: DB, today: string, within = 21): (Listed & { next: string; days: number })[] {
  const rows = db.prepare(`${LISTED} AND c.status IN ${OPEN_SQL} AND (c.deadline_dates <> '[]' OR c.deadline_manual IS NOT NULL)`).all() as Listed[];
  const limit = addDays(today, within);
  const out: (Listed & { next: string; days: number })[] = [];
  for (const r of rows) {
    const next = nextDeadline(JSON.parse(r.deadline_dates), r.deadline_manual, today);
    if (next && next >= today && next <= limit) out.push({ ...r, next, days: Math.round((Date.parse(next) - Date.parse(today)) / DAY) });
  }
  return out.sort((a, b) => a.next.localeCompare(b.next) || a.id - b.id);
}

export function buildQueue(db: DB, listIds: number[], now: Date, cfg: Settings): { items: QueueItem[]; deferred: number } {
  if (!listIds.length) return { items: [], deferred: 0 };
  const rows = db.prepare(`SELECT c.*, l.name AS list_name, l.channel,
      (SELECT l2.name FROM contacts c2 JOIN lists l2 ON l2.id = c2.list_id
        WHERE c2.person_key = c.person_key AND c2.id <> c.id AND c2.status NOT IN ('to_contact','skipped','reference') LIMIT 1) AS dup_list
    FROM contacts c JOIN lists l ON l.id = c.list_id
    WHERE l.kind = 'contacts' AND c.status = 'to_contact' AND c.list_id IN (${listIds.map(() => '?').join(', ')})`)
    .all(...listIds) as (Listed & { dup_list: string | null })[];
  const today = todayIn(cfg.my_timezone, now);
  const soon = addDays(today, 21);
  const sent = orgsSentToday(db, now, cfg);
  const items: QueueItem[] = [];
  let deferred = 0;
  for (const r of rows) {
    if (r.org && (sent.get(norm(r.org)) ?? 0) >= cfg.company_daily_max) { deferred++; continue; }
    const next = nextDeadline(JSON.parse(r.deadline_dates), r.deadline_manual, today);
    items.push({ ...r, next_deadline: next && next >= today ? next : null });
  }
  const urgent = (i: QueueItem) => i.next_deadline !== null && i.next_deadline <= soon;
  const eff = (i: QueueItem) => Math.min(3, i.priority + (i.degree === '2nd' ? 1 : 0));
  items.sort((a, b) =>
    Number(urgent(b)) - Number(urgent(a))
    || (urgent(a) && urgent(b) ? a.next_deadline!.localeCompare(b.next_deadline!) : 0)
    || eff(b) - eff(a) || a.list_id - b.list_id || a.source_row - b.source_row);
  return { items, deferred };
}

/** Sidebar badges: things waiting today, the unsent queue, and table sizes. */
export function navCounts(db: DB, today: string) {
  const n = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  return {
    today: dueFollowUps(db, today).length + repliesWaiting(db).length,
    queue: n("SELECT COUNT(*) AS n FROM contacts WHERE status = 'to_contact'"),
    contacts: n("SELECT COUNT(*) AS n FROM contacts WHERE status <> 'reference'"),
    deadlines: upcomingDeadlines(db, today).length,
    lists: n('SELECT COUNT(*) AS n FROM lists'),
  };
}
