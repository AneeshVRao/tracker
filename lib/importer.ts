import { createHash } from 'node:crypto';
import { tx, type Contact, type DB, type List } from './db';
import { guessChannel, guessExclude, guessInclude, guessKind, guessMapping, type Field, type Mapping } from './mapping';
import { detectProject, dupKey, mapStatus, nameOrgKey, normLinkedIn, parseDeadlines, parseDegree, parseEmail, parsePriority, personKey, type EmailConfidence, type ImportStatus } from './parse';
import { applyAction, todayIn, type Channel, type Settings, type State } from './rules';
import { DEFAULT_TEMPLATES } from './template';
import type { Sheet } from './workbook';

export type TabConfig = {
  sheet: string; include: boolean; listName: string; kind: 'contacts' | 'reference';
  channel: Channel; mapping: Mapping; existingListId: number | null;
};
export type PreviewTab = TabConfig & {
  rowCount: number; headers: string[]; samples: Record<string, string[]>;
  match: 'file+sheet' | 'headers' | null; missingColumns: string[];
};
export type ImportReport = {
  sheet: string; listId: number; listName: string; inserted: number; updated: number; unchanged: number;
  skippedByRule: number; noName: number; crossListDupes: number; duplicateInFile: number; missingFromFile: number;
};
export type ParsedRow = {
  name: string; org: string | null; role: string | null; country: string | null;
  email: string | null; email_confidence: EmailConfidence | null; linkedin_url: string | null;
  message: string | null; priority: number; degree: string | null; mutual: string | null; project_tag: string | null;
  deadline_text: string | null; deadline_dates: string[]; sheet_status: ImportStatus; sent_date: string | null;
};

export const headerSig = (headers: string[]) =>
  createHash('sha1').update(headers.map(h => h.trim().toLowerCase()).join('\u0001')).digest('hex');

function rowToContact(values: Record<string, string>, m: Mapping, projects: string[]): ParsedRow {
  const get = (f: Field) => { const col = m[f]; return col ? (values[col] ?? '').trim() : ''; };
  const orNull = (v: string) => v || null;
  const { email, confidence } = parseEmail(get('email'));
  const { degree, mutual } = parseDegree(get('degree'));
  const message = orNull(get('message'));
  const deadline_text = orNull(get('deadline'));
  return {
    name: get('name'), org: orNull(get('org')), role: orNull(get('role')), country: orNull(get('country')),
    email, email_confidence: confidence, linkedin_url: normLinkedIn(get('linkedin_url')),
    message, priority: parsePriority(get('priority')), degree, mutual, project_tag: detectProject(message, projects),
    deadline_text, deadline_dates: parseDeadlines(deadline_text), sheet_status: mapStatus(get('status')),
    sent_date: parseDeadlines(get('sent_date'))[0] ?? null,
  };
}

function samplesOf(sheet: Sheet): Record<string, string[]> {
  return Object.fromEntries(sheet.headers.map(h => [h,
    sheet.rows.map(r => r.values[h]).filter(Boolean).slice(0, 3).map(v => (v.length > 60 ? `${v.slice(0, 57)}…` : v))]));
}

export function previewSheets(db: DB, fileName: string, sheets: Sheet[]): PreviewTab[] {
  return sheets.map(sheet => {
    const rows = sheet.rows.map(r => r.values);
    const byName = db.prepare('SELECT * FROM lists WHERE source_file = ? AND source_sheet = ?').get(fileName, sheet.name) as List | undefined;
    const byHeaders = byName || !sheet.headers.length ? undefined
      : (db.prepare('SELECT * FROM lists WHERE header_sig = ? ORDER BY id DESC').get(headerSig(sheet.headers)) as List | undefined);
    const prior = byName ?? byHeaders;
    const mapping: Mapping = prior ? JSON.parse(prior.mapping) : { ...guessMapping(sheet.headers), exclude: guessExclude(sheet.headers, rows) };
    const missingColumns = Object.entries(mapping)
      .filter(([k, v]) => k !== 'exclude' && typeof v === 'string' && !sheet.headers.includes(v)).map(([k]) => k);
    for (const k of missingColumns) delete mapping[k as Field];
    if (mapping.exclude && !sheet.headers.includes(mapping.exclude.column)) { delete mapping.exclude; missingColumns.push('exclude'); }
    return {
      sheet: sheet.name, rowCount: rows.length, headers: sheet.headers, samples: samplesOf(sheet),
      include: prior ? true : guessInclude(sheet.name, rows.length),
      listName: prior?.name ?? sheet.name,
      kind: prior?.kind ?? guessKind(sheet.name),
      channel: prior?.channel ?? guessChannel(rows, mapping),
      mapping, existingListId: prior?.id ?? null,
      match: byName ? 'file+sheet' : byHeaders ? 'headers' : null, missingColumns,
    };
  });
}

const EMPTY_STATE: State = { status: 'to_contact', outcome: null, followup_step: 0, follow_up_on: null, sent_at: null };

export function importSheet(db: DB, fileName: string, sheet: Sheet, cfg: TabConfig, opts: { now: Date; settings: Settings }): ImportReport {
  return tx(db, () => {
    const now = opts.now.toISOString();
    const today = todayIn(opts.settings.my_timezone, opts.now);
    const isRef = cfg.kind === 'reference';
    const listCols = [cfg.listName, cfg.kind, isRef ? null : cfg.channel, fileName, sheet.name, headerSig(sheet.headers), JSON.stringify(sheet.headers), JSON.stringify(cfg.mapping)];
    let listId = cfg.existingListId;
    if (listId && !db.prepare('SELECT 1 FROM lists WHERE id = ?').get(listId)) throw new Error(`List ${listId} not found — re-open the import preview`);
    if (listId) {
      db.prepare('UPDATE lists SET name=?, kind=?, channel=?, source_file=?, source_sheet=?, header_sig=?, headers=?, mapping=?, imported_at=? WHERE id=?').run(...listCols, now, listId);
    } else {
      const templates = isRef ? {} : DEFAULT_TEMPLATES[cfg.channel];
      listId = Number(db.prepare('INSERT INTO lists (name, kind, channel, source_file, source_sheet, header_sig, headers, mapping, templates, imported_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(...listCols, JSON.stringify(templates), now).lastInsertRowid);
    }

    const existing = db.prepare('SELECT * FROM contacts WHERE list_id = ?').all(listId) as Contact[];
    const byKey = new Map(existing.map(c => [c.person_key, c]));
    const byNameOrg = new Map(existing.map(c => [nameOrgKey(c.name, c.org), c]));
    const otherKeys = new Set((db.prepare('SELECT DISTINCT person_key FROM contacts WHERE list_id <> ?').all(listId) as { person_key: string }[]).map(r => r.person_key));
    const otherDupKeys = new Set((db.prepare("SELECT DISTINCT dup_key(name, org) AS k FROM contacts WHERE list_id <> ? AND status <> 'reference'").all(listId) as { k: string | null }[]).map(r => r.k));
    const getById = db.prepare('SELECT * FROM contacts WHERE id = ?');
    const addEvent = db.prepare('INSERT INTO events (contact_id, type, at, data) VALUES (?,?,?,?)');
    const seen = new Set<number>();
    const r: ImportReport = { sheet: sheet.name, listId, listName: cfg.listName, inserted: 0, updated: 0, unchanged: 0, skippedByRule: 0, noName: 0, crossListDupes: 0, duplicateInFile: 0, missingFromFile: 0 };
    const rule = cfg.mapping.exclude?.contains ? cfg.mapping.exclude : undefined;

    for (const { row, values } of sheet.rows) {
      const c = rowToContact(values, cfg.mapping, opts.settings.projects);
      if (!c.name) { r.noName++; continue; }
      const key = isRef ? `ref:${row}` : personKey(c);
      if (!isRef && (otherKeys.has(key) || otherDupKeys.has(dupKey(c.name, c.org)))) r.crossListDupes++;
      const hit = byKey.get(key);
      if (hit && seen.has(hit.id)) { r.duplicateInFile++; continue; }
      const fallback = hit || isRef ? undefined : byNameOrg.get(nameOrgKey(c.name, c.org));
      const prior = hit ?? (fallback && !seen.has(fallback.id) ? fallback : undefined);
      const shared = {
        person_key: key, source_row: row, name: c.name, org: c.org, role: c.role, country: c.country,
        email: c.email, email_confidence: c.email_confidence, linkedin_url: c.linkedin_url,
        message_src: c.message, priority: c.priority, degree: c.degree, mutual: c.mutual, project_tag: c.project_tag,
        deadline_text: c.deadline_text, deadline_dates: JSON.stringify(c.deadline_dates), extra: JSON.stringify(values),
      };

      if (prior) {
        seen.add(prior.id);
        // a corrected key may already belong to another contact in this list: keep the old key then
        const keyTaken = prior !== hit && db.prepare('SELECT 1 FROM contacts WHERE list_id = ? AND person_key = ? AND id <> ?').get(listId, key, prior.id);
        const next = { ...shared, ...(keyTaken ? { person_key: prior.person_key } : {}), message: prior.message === prior.message_src ? c.message : prior.message };
        const cols = Object.keys(next) as (keyof typeof next)[];
        if (cols.every(k => prior[k] === next[k])) { r.unchanged++; continue; }
        db.prepare(`UPDATE contacts SET ${cols.map(k => `${k} = ?`).join(', ')} WHERE id = ?`).run(...cols.map(k => next[k]), prior.id);
        const fresh = getById.get(prior.id) as Contact;
        if (fresh.person_key !== prior.person_key) byKey.delete(prior.person_key);
        byKey.set(fresh.person_key, fresh);
        byNameOrg.set(nameOrgKey(c.name, c.org), fresh);
        r.updated++;
        continue;
      }

      const excluded = !isRef && !!rule && (values[rule.column] ?? '').toUpperCase().includes(rule.contains.toUpperCase());
      let state: State = { ...EMPTY_STATE, status: isRef ? 'reference' : excluded ? 'skipped' : c.sheet_status };
      if (state.status === 'sent') {
        const sentDay = c.sent_date ?? today;
        const sentAt = c.sent_date ? `${c.sent_date}T00:00:00.000Z` : now;
        state = { ...state, ...applyAction(EMPTY_STATE, cfg.channel, 'sent', { today: sentDay, now: sentAt }, opts.settings).patch };
      }
      const row_ = { ...shared, message: c.message, status: state.status, outcome: null, followup_step: state.followup_step, follow_up_on: state.follow_up_on, sent_at: state.sent_at, last_touch_at: state.sent_at, list_id: listId };
      const cols = Object.keys(row_) as (keyof typeof row_)[];
      const id = Number(db.prepare(`INSERT INTO contacts (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map(k => row_[k])).lastInsertRowid);
      addEvent.run(id, 'imported', now, JSON.stringify({ file: fileName, sheet: sheet.name, row, status: state.status, ...(excluded ? { excludedBy: rule } : {}) }));
      if (state.status === 'sent') addEvent.run(id, 'sent', state.sent_at!, JSON.stringify({ fromImport: true }));
      if (excluded) r.skippedByRule++;
      r.inserted++;
      const fresh = getById.get(id) as Contact;
      byKey.set(key, fresh);
      byNameOrg.set(nameOrgKey(c.name, c.org), fresh);
      seen.add(id);
    }
    r.missingFromFile = existing.filter(c => !seen.has(c.id)).length;
    return r;
  });
}
