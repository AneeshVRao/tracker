import type { SQLInputValue } from 'node:sqlite';
import { tx, type Contact, type DB, type EventRow, type List } from './db';
import { applyAction, DEFAULT_SETTINGS, OPEN_STATUSES, todayIn, type Action, type EventType, type Outcome, type Settings, type Status } from './rules';
import { norm } from './parse';
import type { TemplateSet } from './template';
import { activityStats, orgsSentToday } from './today';

export function getSettings(db: DB): Settings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  return { ...structuredClone(DEFAULT_SETTINGS), ...Object.fromEntries(rows.map(r => [r.key, JSON.parse(r.value)])) } as Settings;
}

const INT_FIELDS: [key: string, label: string, min: number, max: number][] = [
  ['weekly_invite_cap', 'Weekly LinkedIn invite cap', 1, 500],
  ['company_daily_max', 'Sends per company per day', 1, 20],
  ['nudge1', 'First nudge after (days)', 1, 60],
  ['nudge2', 'Second nudge after (days)', 1, 60],
  ['linkedin_withdraw_days', 'Withdraw invite after (days)', 1, 90],
  ['after_accept_followup_days', 'Message after accept within (days)', 1, 60],
  ['checkin_days', 'Check-in interval (days)', 1, 60],
];

export function saveSettings(db: DB, input: Record<string, string>) {
  const n: Record<string, number> = {};
  for (const [k, label, min, max] of INT_FIELDS) {
    const v = (input[k] ?? '').trim();
    if (!/^\d+$/.test(v) || +v < min || +v > max) throw new Error(`${label} must be a whole number from ${min} to ${max}`);
    n[k] = +v;
  }
  const tz = (input.my_timezone ?? '').trim();
  if (!tz) throw new Error('Time zone is required');
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { throw new Error(`Unknown time zone "${tz}"`); }
  const projects = (input.projects ?? '').split(',').map(p => p.trim()).filter(Boolean);
  if (!projects.length || projects.length > 20) throw new Error('List 1–20 project names, comma-separated');
  const values: Record<string, unknown> = {
    weekly_invite_cap: n.weekly_invite_cap, company_daily_max: n.company_daily_max, email_nudge_days: [n.nudge1, n.nudge2],
    linkedin_withdraw_days: n.linkedin_withdraw_days, after_accept_followup_days: n.after_accept_followup_days,
    checkin_days: n.checkin_days, my_timezone: tz, projects,
  };
  const up = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  tx(db, () => { for (const [k, v] of Object.entries(values)) up.run(k, JSON.stringify(v)); });
}

// ---- reads -----------------------------------------------------------------
export const PAGE_SIZE = 100;
export type Filters = { list?: number; status?: string; q?: string; priority?: number; conf?: string; col?: string; val?: string; sort?: string; page?: number };
const SORTS: Record<string, string> = {
  priority: 'priority DESC, list_id, source_row, id',
  name: 'name COLLATE NOCASE, id',
  touched: 'last_touch_at DESC NULLS LAST, id',
  follow: 'follow_up_on IS NULL, follow_up_on, id',
};

export function listContacts(db: DB, f: Filters): { rows: Contact[]; total: number } {
  const where = ["status <> 'reference'"];
  const args: SQLInputValue[] = [];
  const add = (sql: string, ...v: SQLInputValue[]) => { where.push(sql); args.push(...v); };
  if (f.list) add('list_id = ?', f.list);
  if (f.status === 'open') where.push("status IN ('to_contact','sent','accepted','replied','conversation')");
  else if (f.status) add('status = ?', f.status);
  if (f.priority) add('priority = ?', f.priority);
  if (f.conf === 'none') where.push('email IS NULL');
  else if (f.conf) add('email_confidence = ?', f.conf);
  const like = (s: string) => `%${s.replace(/[\\%_]/g, '\\$&')}%`;
  if (f.q) { const l = like(f.q); add("(name LIKE ? ESCAPE '\\' OR org LIKE ? ESCAPE '\\' OR role LIKE ? ESCAPE '\\' OR message LIKE ? ESCAPE '\\')", l, l, l, l); }
  if (f.col && f.val && listHeaders(db, f.list).includes(f.col)) add("json_extract(extra, ?) LIKE ? ESCAPE '\\'", `$."${f.col.replaceAll('"', '')}"`, like(f.val));
  const w = where.join(' AND ');
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM contacts WHERE ${w}`).get(...args) as { n: number }).n;
  const page = Math.max(1, f.page ?? 1);
  const order = Object.hasOwn(SORTS, f.sort ?? '') ? SORTS[f.sort!] : 'list_id, source_row, id';
  const rows = db.prepare(`SELECT * FROM contacts WHERE ${w} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args, PAGE_SIZE, (page - 1) * PAGE_SIZE) as Contact[];
  return { rows, total };
}

export type ListSummary = List & { total: number; to_contact: number; pending: number; talking: number; closed: number; skipped: number };
export function listSummaries(db: DB): ListSummary[] {
  return db.prepare(`
    SELECT l.*, COUNT(c.id) AS total,
      COALESCE(SUM(c.status = 'to_contact'), 0) AS to_contact,
      COALESCE(SUM(c.status IN ('sent','accepted')), 0) AS pending,
      COALESCE(SUM(c.status IN ('replied','conversation')), 0) AS talking,
      COALESCE(SUM(c.status = 'closed'), 0) AS closed,
      COALESCE(SUM(c.status = 'skipped'), 0) AS skipped
    FROM lists l LEFT JOIN contacts c ON c.list_id = l.id
    GROUP BY l.id ORDER BY l.id`).all() as ListSummary[];
}

export const getList = (db: DB, id: number) => db.prepare('SELECT * FROM lists WHERE id = ?').get(id) as List | undefined;

export function listHeaders(db: DB, listId?: number): string[] {
  const rows = (listId
    ? db.prepare('SELECT headers FROM lists WHERE id = ?').all(listId)
    : db.prepare("SELECT headers FROM lists WHERE kind = 'contacts'").all()) as { headers: string }[];
  return [...new Set(rows.flatMap(r => JSON.parse(r.headers) as string[]))];
}

export type ContactDetail = {
  contact: Contact; list: List; events: EventRow[]; alsoIn: { list: string; status: Status }[]; canUndo: boolean;
  invites: { used: number; cap: number } | null; orgSentToday: number; companyMax: number;
};
export function getContactDetail(db: DB, id: number, now = new Date()): ContactDetail | null {
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id) as Contact | undefined;
  if (!contact) return null;
  const list = getList(db, contact.list_id)!;
  const cfg = getSettings(db);
  const events = db.prepare('SELECT * FROM events WHERE contact_id = ? ORDER BY id DESC').all(id) as EventRow[];
  const alsoIn = db.prepare("SELECT l.name AS list, c.status FROM contacts c JOIN lists l ON l.id = c.list_id WHERE c.person_key = ? AND c.id <> ? AND c.status <> 'reference'")
    .all(contact.person_key, id) as ContactDetail['alsoIn'];
  const stats = list.channel === 'linkedin' ? activityStats(db, now, cfg) : null;
  return {
    contact, list, events, alsoIn, canUndo: undoTarget(db, id) !== undefined,
    invites: stats && { used: stats.invitesWeek, cap: stats.cap },
    orgSentToday: contact.org ? orgsSentToday(db, now, cfg).get(norm(contact.org)) ?? 0 : 0,
    companyMax: cfg.company_daily_max,
  };
}

// ---- writes ----------------------------------------------------------------
// Columns an action/edit may change — also the whitelist for undo.
const PATCHABLE = new Set(['status', 'outcome', 'followup_step', 'follow_up_on', 'sent_at', 'last_touch_at', 'message', 'deadline_manual', 'tz']);

function mustGet(db: DB, id: number): Contact {
  const c = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id) as Contact | undefined;
  if (!c) throw new Error(`Contact ${id} not found`);
  return c;
}

function writePatch(db: DB, c: Contact, patch: Record<string, SQLInputValue>, type: EventType, data: object, now: Date) {
  const full = { ...patch, last_touch_at: now.toISOString() };
  const keys = Object.keys(full);
  if (!keys.every(k => PATCHABLE.has(k))) throw new Error('Unpatchable field');
  const prev = Object.fromEntries(keys.map(k => [k, c[k as keyof Contact]]));
  db.prepare(`UPDATE contacts SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map(k => full[k as keyof typeof full] as SQLInputValue), c.id);
  db.prepare('INSERT INTO events (contact_id, type, at, data) VALUES (?,?,?,?)').run(c.id, type, now.toISOString(), JSON.stringify({ ...data, prev }));
}

export class LimitError extends Error {
  constructor(public used: number, public cap: number) {
    super(`Weekly LinkedIn invite cap reached (${used}/${cap})`);
  }
}

export function performAction(db: DB, id: number, action: Action, outcome?: Outcome, now = new Date(), opts: { override?: boolean } = {}) {
  tx(db, () => {
    const c = mustGet(db, id);
    const list = getList(db, c.list_id)!;
    if (list.kind !== 'contacts' || !list.channel) throw new Error('Reference rows have no actions');
    const cfg = getSettings(db);
    if (action === 'sent' && list.channel === 'linkedin') {
      const s = activityStats(db, now, cfg);
      if (s.invitesWeek >= s.cap) {
        if (!opts.override) throw new LimitError(s.invitesWeek, s.cap);
        db.prepare("INSERT INTO events (contact_id, type, at, data) VALUES (?, 'limit_override', ?, ?)")
          .run(c.id, now.toISOString(), JSON.stringify({ used: s.invitesWeek, cap: s.cap }));
      }
    }
    const { patch, event } = applyAction(c, list.channel, action, { today: todayIn(cfg.my_timezone, now), now: now.toISOString(), outcome }, cfg);
    writePatch(db, c, patch as Record<string, SQLInputValue>, event, { action, outcome: outcome ?? null }, now);
  });
}

export function closeStale(db: DB, now = new Date()): number {
  const today = todayIn(getSettings(db).my_timezone, now);
  const ids = (db.prepare(`SELECT c.id FROM contacts c JOIN lists l ON l.id = c.list_id
    WHERE l.channel = 'email' AND c.status = 'sent' AND c.followup_step >= 3 AND c.follow_up_on <= ?`).all(today) as { id: number }[]).map(r => r.id);
  for (const id of ids) performAction(db, id, 'close', 'no_reply', now);
  return ids.length;
}

const undoTarget = (db: DB, id: number) =>
  db.prepare("SELECT id, data FROM events WHERE contact_id = ? AND reverted = 0 AND type <> 'imported' AND json_extract(data, '$.prev') IS NOT NULL ORDER BY id DESC LIMIT 1")
    .get(id) as { id: number; data: string } | undefined;

export function undoLast(db: DB, id: number): boolean {
  return tx(db, () => {
    const e = undoTarget(db, id);
    if (!e) return false;
    const prev = JSON.parse(e.data).prev as Record<string, SQLInputValue>;
    const keys = Object.keys(prev);
    if (!keys.every(k => PATCHABLE.has(k))) throw new Error('Corrupt undo data');
    db.prepare(`UPDATE contacts SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map(k => prev[k]), id);
    db.prepare('UPDATE events SET reverted = 1 WHERE id = ?').run(e.id);
    return true;
  });
}

export type EditableField = 'message' | 'follow_up_on' | 'deadline_manual' | 'tz';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function editContact(db: DB, id: number, field: EditableField, value: string | null, now = new Date()) {
  if (!['message', 'follow_up_on', 'deadline_manual', 'tz'].includes(field)) throw new Error(`Unknown field ${field}`);
  if ((field === 'follow_up_on' || field === 'deadline_manual') && value !== null && !ISO_DATE.test(value)) throw new Error('Expected a YYYY-MM-DD date');
  if (field === 'tz' && value !== null) {
    try { new Intl.DateTimeFormat('en', { timeZone: value }); } catch { throw new Error(`Unknown time zone ${value}`); }
  }
  tx(db, () => writePatch(db, mustGet(db, id), { [field]: value }, 'edited', { field }, now));
}

export function setNotes(db: DB, id: number, text: string) {
  db.prepare('UPDATE contacts SET my_notes = ? WHERE id = ?').run(text.trim() || null, id);
}

export function bulkSkip(db: DB, ids: number[], now = new Date()): number {
  const cs = ids.map(id => mustGet(db, id)); // validate all before writing any
  let n = 0;
  for (const { id } of cs) {
    if (mustGet(db, id).status !== 'to_contact') continue;
    performAction(db, id, 'skip', undefined, now);
    n++;
  }
  return n;
}

export function bulkFollowUp(db: DB, ids: number[], date: string, now = new Date()): number {
  const cs = ids.map(id => mustGet(db, id));
  if (!ISO_DATE.test(date)) throw new Error('Expected a YYYY-MM-DD date');
  const open = cs.filter(c => OPEN_STATUSES.includes(c.status));
  for (const c of open) editContact(db, c.id, 'follow_up_on', date, now);
  return open.length;
}

export function saveTemplates(db: DB, listId: number, t: TemplateSet) {
  db.prepare("UPDATE lists SET templates = ? WHERE id = ? AND kind = 'contacts'").run(JSON.stringify(t), listId);
}
