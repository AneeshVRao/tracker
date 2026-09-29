import ExcelJS from 'exceljs';
import { expect, test } from 'vitest';
import { openDb } from './db';
import { buildExport } from './export';

test('one tab per list (reference lists: original columns only) with original columns + tracking columns', async () => {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO lists (name, kind, channel, source_file, source_sheet, header_sig, headers, mapping, imported_at) VALUES ('Profs: A/B', 'contacts', 'email', 'f', 's', 'h', ?, '{}', 't')").run(JSON.stringify(['Name', 'Track']));
  db.prepare("INSERT INTO lists (name, kind, channel, source_file, source_sheet, header_sig, headers, mapping, imported_at) VALUES ('Progs', 'reference', NULL, 'f', 'p', 'h2', '[\"Program\"]', '{}', 't')").run();
  db.prepare("INSERT INTO contacts (list_id, person_key, source_row, name, status, extra) VALUES (2, 'p', 2, 'MS CS', 'reference', ?)").run(JSON.stringify({ Program: 'MS CS' }));
  db.prepare("INSERT INTO contacts (list_id, person_key, source_row, name, message, status, my_notes, extra) VALUES (1, 'k', 2, 'Prof A', 'edited', 'sent', 'n1', ?)").run(JSON.stringify({ Name: 'Prof A', Track: 'HW' }));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await buildExport(db)) as unknown as ExcelJS.Buffer);
  expect(wb.worksheets.map(w => w.name)).toEqual(['Profs A B', 'Progs']);
  const ref = wb.worksheets[1];
  expect(ref.columnCount).toBe(1);
  expect([1, 2].map(n => ref.getRow(n).getCell(1).text)).toEqual(['Program', 'MS CS']);
  const ws = wb.worksheets[0];
  const row = (n: number) => Array.from({ length: 9 }, (_, i) => ws.getRow(n).getCell(i + 1).text);
  expect(row(1)).toEqual(['Name', 'Track', 'Status', 'Outcome', 'Sent At', 'Follow Up On', 'Message (current)', 'My Notes', 'Last Touch']);
  expect(row(2)).toEqual(['Prof A', 'HW', 'Sent', '', '', '', 'edited', 'n1', '']);
});

test('dates use my_timezone and outcome uses its label', async () => {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO lists (name, kind, channel, source_file, source_sheet, header_sig, headers, mapping, imported_at) VALUES ('P', 'contacts', 'email', 'f', 's', 'h', '[\"Name\"]', '{}', 't')").run();
  db.prepare("INSERT INTO contacts (list_id, person_key, source_row, name, status, outcome, sent_at, last_touch_at, extra) VALUES (1, 'k', 2, 'A', 'closed', 'no_reply', '2026-09-28T20:00:00.000Z', '2026-09-28T20:00:00.000Z', '{\"Name\":\"A\"}')").run();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await buildExport(db)) as unknown as ExcelJS.Buffer);
  const r = wb.worksheets[0].getRow(2);
  expect([3, 4, 5, 8].map(i => r.getCell(i).text)).toEqual(['No reply', '2026-09-29', '', '2026-09-29']);
});
