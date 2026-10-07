import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { dupKey, type EmailConfidence } from './parse';
import type { Channel, EventType, Outcome, Status } from './rules';

export type DB = DatabaseSync;

export type List = {
  id: number; name: string; kind: 'contacts' | 'reference'; channel: Channel | null;
  source_file: string; source_sheet: string; header_sig: string;
  headers: string; mapping: string; templates: string; imported_at: string; // JSON columns are strings
};

export type Contact = {
  id: number; list_id: number; person_key: string; source_row: number;
  name: string; org: string | null; role: string | null; country: string | null;
  email: string | null; email_confidence: EmailConfidence | null; linkedin_url: string | null;
  message: string | null; message_src: string | null; priority: number;
  degree: string | null; mutual: string | null; project_tag: string | null; tz: string | null;
  deadline_text: string | null; deadline_dates: string; deadline_manual: string | null;
  status: Status; outcome: Outcome | null; followup_step: number; follow_up_on: string | null;
  sent_at: string | null; last_touch_at: string | null; my_notes: string | null; extra: string;
};

export type EventRow = { id: number; contact_id: number; type: EventType; at: string; data: string | null; reverted: number };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS lists (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'contacts' CHECK (kind IN ('contacts','reference')),
  channel TEXT CHECK (channel IN ('email','linkedin')),
  source_file TEXT NOT NULL,
  source_sheet TEXT NOT NULL,
  header_sig TEXT NOT NULL,
  headers TEXT NOT NULL DEFAULT '[]',
  mapping TEXT NOT NULL,
  templates TEXT NOT NULL DEFAULT '{}',
  imported_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY,
  list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  person_key TEXT NOT NULL,
  source_row INTEGER NOT NULL,
  name TEXT NOT NULL, org TEXT, role TEXT, country TEXT,
  email TEXT, email_confidence TEXT CHECK (email_confidence IN ('verified','inferred','unknown')),
  linkedin_url TEXT,
  message TEXT, message_src TEXT,
  priority INTEGER NOT NULL DEFAULT 2,
  degree TEXT, mutual TEXT, project_tag TEXT, tz TEXT,
  deadline_text TEXT, deadline_dates TEXT NOT NULL DEFAULT '[]', deadline_manual TEXT,
  status TEXT NOT NULL DEFAULT 'to_contact'
    CHECK (status IN ('to_contact','sent','accepted','replied','conversation','closed','skipped','reference')),
  outcome TEXT CHECK (outcome IN ('positive','declined','no_reply','bounced','withdrawn')),
  followup_step INTEGER NOT NULL DEFAULT 0,
  follow_up_on TEXT, sent_at TEXT, last_touch_at TEXT, my_notes TEXT,
  extra TEXT NOT NULL,
  UNIQUE (list_id, person_key)
);
CREATE INDEX IF NOT EXISTS contacts_person ON contacts(person_key);
CREATE INDEX IF NOT EXISTS contacts_due ON contacts(follow_up_on);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  at TEXT NOT NULL,
  data TEXT,
  reverted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS events_contact ON events(contact_id);
CREATE INDEX IF NOT EXISTS events_type_at ON events(type, at);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

export function openDb(file: string): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  db.function('dup_key', { deterministic: true }, (name, org) => dupKey(String(name ?? ''), org == null ? null : String(org)));
  return db;
}

// One connection per server process; cached on globalThis so dev hot-reload doesn't reopen it.
const g = globalThis as { __trackerDb?: DB };
export function getDb(): DB {
  return (g.__trackerDb ??= openDb(process.env.TRACKER_DB ?? path.join(process.cwd(), 'data', 'tracker.db')));
}

export function tx<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
