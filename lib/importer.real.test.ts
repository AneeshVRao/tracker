import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { openDb, type DB } from './db';
import { importSheet, previewSheets, type ImportReport } from './importer';
import { DEFAULT_SETTINGS as settings } from './rules';
import { readWorkbook } from './workbook';

const DIR = process.env.TRACKER_REAL_DIR ?? 'D:/Downloads';
const FILES = ['research_internship_tracker_1.xlsx', 'Aneesh_Remote_HR_Contacts.xlsx', 'Aneesh_NITW_Alumni_Connections.xlsx'];
const available = FILES.every(f => existsSync(path.join(DIR, f)));
const now = new Date('2026-09-29T06:00:00Z');

async function importAll(db: DB): Promise<ImportReport[]> {
  const out: ImportReport[] = [];
  for (const f of FILES) {
    const sheets = await readWorkbook(readFileSync(path.join(DIR, f)));
    for (const t of previewSheets(db, f, sheets).filter(t => t.include))
      out.push(importSheet(db, f, sheets.find(s => s.name === t.sheet)!, t, { now, settings }));
  }
  return out;
}

describe.skipIf(!available)('real workbooks (spec F1 acceptance)', () => {
  test('1000 contacts + 30 reference rows, correct mapping, idempotent', async () => {
    const db = openDb(':memory:');
    const first = await importAll(db);
    expect(first.map(r => [r.sheet, r.inserted, r.noName])).toEqual([
      ['Professors', 250, 0], ['Formal Programmes', 30, 0], ['Contacts', 466, 0], ['Alumni Pipeline', 234, 0], ['Verified - not working', 50, 0],
    ]);
    const lists = db.prepare('SELECT source_sheet, mapping FROM lists').all() as { source_sheet: string; mapping: string }[];
    const prof = JSON.parse(lists.find(l => l.source_sheet === 'Professors')!.mapping);
    expect(prof).toMatchObject({ status: 'Status', message: 'Specific Email Angle' });
    const skipped = db.prepare("SELECT COUNT(*) AS n FROM contacts c JOIN lists l ON l.id = c.list_id WHERE l.source_sheet = 'Professors' AND c.status = 'skipped'").get() as { n: number };
    expect(skipped.n).toBe(11);

    const statusesBefore = db.prepare('SELECT id, status FROM contacts ORDER BY id').all();
    const second = await importAll(db);
    expect(second.every(r => r.inserted === 0 && r.updated === 0)).toBe(true);
    expect(db.prepare('SELECT id, status FROM contacts ORDER BY id').all()).toEqual(statusesBefore);
  });

  test('every deadline cell with a day+month+year yields at least one date', async () => {
    const db = openDb(':memory:');
    await importAll(db);
    const rows = db.prepare("SELECT deadline_text, deadline_dates FROM contacts WHERE deadline_text IS NOT NULL").all() as { deadline_text: string; deadline_dates: string }[];
    const M = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';
    const hasDate = new RegExp(`(${M}\\s+\\d{1,2}\\b|\\b\\d{1,2}(st|nd|rd|th)?\\s+${M}).*\\b20\\d\\d\\b|\\b20\\d\\d-\\d\\d-\\d\\d\\b`, 'i');
    const misses = rows.filter(r => hasDate.test(r.deadline_text) && r.deadline_dates === '[]').map(r => r.deadline_text);
    expect(misses).toEqual([]);
  });
});
