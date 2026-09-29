import ExcelJS from 'exceljs';
import { describe, expect, test } from 'vitest';
import { openDb, type Contact, type DB, type EventRow } from './db';
import { importSheet, previewSheets } from './importer';
import { DEFAULT_SETTINGS as settings } from './rules';
import { cellText, readWorkbook, type Sheet } from './workbook';

const now = new Date('2026-09-29T06:00:00Z');
const PROF = [
  ['Name', 'Institute/University', 'Country', 'Paper Read Status', 'Fit Rating', 'Application Deadline', 'Visa/Logistics Note', 'Email (verified vs inferred)', 'Specific Email Angle', 'Status', 'Notes'],
  ['Prof A', 'IIT X', 'India', 'Full read', 'Strong', 'SRFP: Nov 30, 2026', '', 'a@iitx.ac.in (VERIFIED - page)', 'Angle A', 'Not Started', ''],
  ['Prof B', 'IIT Y', 'USA', 'Full read', 'Moderate', 'N/A', 'visa note', 'b@y.edu (INFERRED - pattern)', 'Angle B', 'Dropped', ''],
  ['Prof C', 'IIT Z', 'India', 'Skimmed', 'Weak', '', '', '', 'Angle C', 'Not Started', 'FAILS CUTOFF - rank 40'],
];
const ALUMNI = [
  ['#', 'Name', 'Current Company', 'Priority', 'LinkedIn URL', 'Connection Note (<=300 chars)', 'Outreach Status', 'Date Sent', 'Your Notes'],
  ['1', 'Al One', 'Acme', 'High - core', 'https://www.linkedin.com/in/al-one/', 'Hi Al, I built ContextCraft', 'Not sent', '', ''],
  ['2', 'Bo Two', 'Beta', 'Low', 'https://linkedin.com/in/Bo-Two?x=1', 'Hi Bo', 'Sent', '2026-09-20', ''],
];
const README = [['Read me first'], ['Some text']];
const PROGS = [['programme', 'host', 'deadline', 'url'], ['SRFP', 'IAS', '30 November 2026', 'https://x.test']];

async function book(sheets: Record<string, string[][]>): Promise<Sheet[]> {
  const wb = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) wb.addWorksheet(name).addRows(rows);
  return readWorkbook(Buffer.from(await wb.xlsx.writeBuffer()));
}
function importAll(db: DB, file: string, sheets: Sheet[]) {
  return previewSheets(db, file, sheets).filter(t => t.include)
    .map(t => importSheet(db, file, sheets.find(s => s.name === t.sheet)!, t, { now, settings }));
}
const byName = (db: DB, name: string) => db.prepare('SELECT * FROM contacts WHERE name = ?').get(name) as Contact;

describe('readWorkbook', () => {
  test('headers from first row with ≥3 filled cells; empty rows skipped', async () => {
    const [s] = await book({ S: [['Title only'], ['a', 'b', 'c'], ['1', '2', '3'], [], ['4', '', '6']] });
    expect(s.headers).toEqual(['a', 'b', 'c']);
    expect(s.rows).toEqual([{ row: 3, values: { a: '1', b: '2', c: '3' } }, { row: 5, values: { a: '4', b: '', c: '6' } }]);
  });
});

describe('cellText', () => {
  test('invalid Date yields empty string', () => {
    expect(cellText(new Date('nope'))).toBe('');
    expect(cellText(new Date('2026-09-20T00:00:00Z'))).toBe('2026-09-20');
  });
});

describe('previewSheets', () => {
  test('missing mapped and exclude columns are reported and dropped from the mapping', async () => {
    const db = openDb(':memory:');
    importAll(db, 'prof.xlsx', await book({ Professors: PROF }));
    const renamed = PROF.map((r, i) => r.map(c => (i === 0 ? c.replace(/^Status$/, 'Stage').replace(/^Notes$/, 'Remarks') : c)));
    const [t] = previewSheets(db, 'prof.xlsx', await book({ Professors: renamed }));
    expect(t.missingColumns).toEqual(expect.arrayContaining(['status', 'exclude']));
    expect(t.mapping.status).toBeUndefined();
    expect(t.mapping.exclude).toBeUndefined();
  });
});

describe('previewSheets (guesses)', () => {
  test('guesses include, kind, channel, mapping, exclude', async () => {
    const db = openDb(':memory:');
    const tabs = previewSheets(db, 'prof.xlsx', await book({ 'Read me first': README, Professors: PROF, 'Formal Programmes': PROGS }));
    expect(tabs.map(t => [t.sheet, t.include, t.kind])).toEqual([['Read me first', false, 'contacts'], ['Professors', true, 'contacts'], ['Formal Programmes', true, 'reference']]);
    const p = tabs[1];
    expect(p.channel).toBe('email');
    expect(p.mapping).toMatchObject({ status: 'Status', message: 'Specific Email Angle', exclude: { column: 'Notes', contains: 'FAILS CUTOFF' } });
    expect(p.samples['Fit Rating']).toEqual(['Strong', 'Moderate', 'Weak']);
    expect(p.match).toBeNull();
  });
});

describe('importSheet', () => {
  test('first import: statuses, exclude rule, sent rows, reference rows', async () => {
    const db = openDb(':memory:');
    const reports = importAll(db, 'prof.xlsx', await book({ Professors: PROF, 'Formal Programmes': PROGS }))
      .concat(importAll(db, 'alumni.xlsx', await book({ 'Alumni Pipeline': ALUMNI })));
    expect(reports.map(r => [r.sheet, r.inserted, r.skippedByRule])).toEqual([['Professors', 3, 1], ['Formal Programmes', 1, 0], ['Alumni Pipeline', 2, 0]]);
    expect(byName(db, 'Prof A')).toMatchObject({ status: 'to_contact', email: 'a@iitx.ac.in', email_confidence: 'verified', priority: 3, deadline_dates: '["2026-11-30"]' });
    expect(byName(db, 'Prof B').status).toBe('skipped');
    expect(byName(db, 'Prof C').status).toBe('skipped');
    expect(byName(db, 'SRFP')).toMatchObject({ status: 'reference', person_key: 'ref:2' });
    expect(byName(db, 'Al One')).toMatchObject({ project_tag: 'ContextCraft', linkedin_url: 'https://www.linkedin.com/in/al-one' });
    const bo = byName(db, 'Bo Two');
    expect(bo).toMatchObject({ status: 'sent', sent_at: '2026-09-20T00:00:00.000Z', follow_up_on: '2026-10-11', followup_step: 1 });
    const boEvents = db.prepare('SELECT type, at FROM events WHERE contact_id = ? ORDER BY id').all(bo.id) as Pick<EventRow, 'type' | 'at'>[];
    expect(boEvents.map(e => e.type)).toEqual(['imported', 'sent']);
    expect(boEvents[1].at).toBe('2026-09-20T00:00:00.000Z');
  });

  test('re-import is idempotent and recognised by file+sheet', async () => {
    const db = openDb(':memory:');
    const sheets = await book({ Professors: PROF });
    importAll(db, 'prof.xlsx', sheets);
    db.prepare("UPDATE contacts SET status = 'sent' WHERE name = 'Prof A'").run();
    const tabs = previewSheets(db, 'prof.xlsx', sheets);
    expect(tabs[0]).toMatchObject({ match: 'file+sheet', existingListId: 1 });
    const [r] = importAll(db, 'prof.xlsx', sheets);
    expect(r).toMatchObject({ inserted: 0, updated: 0, unchanged: 3, missingFromFile: 0 });
    expect(byName(db, 'Prof A').status).toBe('sent');
  });

  test('user-edited message survives re-import; unedited one refreshes', async () => {
    const db = openDb(':memory:');
    importAll(db, 'prof.xlsx', await book({ Professors: PROF }));
    db.prepare("UPDATE contacts SET message = 'My edit' WHERE name = 'Prof A'").run();
    const changed = PROF.map(r => r.map(c => (c.startsWith('Angle ') ? `${c} v2` : c)));
    const [r] = importAll(db, 'prof.xlsx', await book({ Professors: changed }));
    expect(r.updated).toBe(3);
    expect(byName(db, 'Prof A')).toMatchObject({ message: 'My edit', message_src: 'Angle A v2' });
    expect(byName(db, 'Prof B')).toMatchObject({ message: 'Angle B v2', message_src: 'Angle B v2' });
  });

  test('corrected email matches by name|org instead of duplicating', async () => {
    const db = openDb(':memory:');
    importAll(db, 'prof.xlsx', await book({ Professors: PROF }));
    const fixed = PROF.map(r => r.map(c => c.replace('b@y.edu', 'bee@y.edu')));
    const [r] = importAll(db, 'prof.xlsx', await book({ Professors: fixed }));
    expect(r).toMatchObject({ inserted: 0, updated: 1 });
    expect(byName(db, 'Prof B')).toMatchObject({ email: 'bee@y.edu', person_key: 'bee@y.edu' });
  });

  test('same headers in a new file are offered as the old list; as a new list, dupes and nameless rows are counted', async () => {
    const db = openDb(':memory:');
    importAll(db, 'alumni.xlsx', await book({ 'Alumni Pipeline': ALUMNI }));
    const other = [ALUMNI[0], ALUMNI[1], ['3', '', 'X', 'High', '', 'note', '', '', '']];
    const sheets = await book({ Other: other });
    const [t] = previewSheets(db, 'other.xlsx', sheets);
    expect(t).toMatchObject({ match: 'headers', existingListId: 1 });
    const r = importSheet(db, 'other.xlsx', sheets[0], { ...t, existingListId: null, listName: 'Other' }, { now, settings });
    expect(r).toMatchObject({ inserted: 1, noName: 1, crossListDupes: 1 });
  });

  test('duplicate row in the same file is skipped and counted', async () => {
    const db = openDb(':memory:');
    const [r] = importAll(db, 'prof.xlsx', await book({ Professors: [...PROF, PROF[1]] }));
    expect(r).toMatchObject({ inserted: 3, updated: 0, duplicateInFile: 1 });
  });

  test('different person with same name+org (different email) is inserted, not merged into the earlier row', async () => {
    const db = openDb(':memory:');
    const twin = [...PROF[1]]; twin[7] = 'other@iitx.ac.in (VERIFIED - page)';
    const [r] = importAll(db, 'prof.xlsx', await book({ Professors: [...PROF, twin] }));
    expect(r).toMatchObject({ inserted: 4, updated: 0, duplicateInFile: 0 });
  });

  test('re-import via UPDATE path keeps status, notes, follow-up and events', async () => {
    const db = openDb(':memory:');
    importAll(db, 'prof.xlsx', await book({ Professors: PROF }));
    db.prepare("UPDATE contacts SET status = 'sent', my_notes = 'n', follow_up_on = '2026-10-10' WHERE name = 'Prof A'").run();
    const events = () => (db.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n;
    const before = events();
    const changed = PROF.map(r => r.map(c => (c === 'Angle A' ? 'Angle A v2' : c)));
    const [r] = importAll(db, 'prof.xlsx', await book({ Professors: changed }));
    expect(r.updated).toBe(1);
    expect(byName(db, 'Prof A')).toMatchObject({ status: 'sent', my_notes: 'n', follow_up_on: '2026-10-10', message_src: 'Angle A v2' });
    expect(events()).toBe(before);
  });

  test('unknown existingListId throws before writing', async () => {
    const db = openDb(':memory:');
    const sheets = await book({ Professors: PROF });
    const [t] = previewSheets(db, 'prof.xlsx', sheets);
    expect(() => importSheet(db, 'prof.xlsx', sheets[0], { ...t, existingListId: 99 }, { now, settings })).toThrow('List 99 not found');
    expect((db.prepare('SELECT COUNT(*) AS n FROM contacts').get() as { n: number }).n).toBe(0);
  });
});
