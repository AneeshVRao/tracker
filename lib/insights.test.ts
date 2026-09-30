import { describe, expect, test } from 'vitest';
import { openDb, type Contact, type DB } from './db';
import { introGroups, referenceDeadlines, statsBy } from './insights';

let n = 0;
function seed(): DB {
  const db = openDb(':memory:');
  const L = db.prepare("INSERT INTO lists (name, kind, channel, source_file, source_sheet, header_sig, headers, mapping, imported_at) VALUES (?, ?, ?, 'f', ?, 'h', '[]', '{}', 't')");
  L.run('Profs', 'contacts', 'email', 'P');      // 1
  L.run('HR', 'contacts', 'linkedin', 'H');      // 2
  L.run('Programmes', 'reference', null, 'R');   // 3
  return db;
}
function contact(db: DB, o: Partial<Contact> & { list_id: number; name: string }): number {
  const row: Record<string, unknown> = { person_key: `k${++n}`, source_row: 2, priority: 2, status: 'to_contact', extra: '{}', ...o };
  const cols = Object.keys(row);
  return Number(db.prepare(`INSERT INTO contacts (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .run(...cols.map(k => row[k] as string | number | null)).lastInsertRowid);
}
const ev = (db: DB, id: number, type: string, at: string, reverted = 0) =>
  db.prepare('INSERT INTO events (contact_id, type, at, data, reverted) VALUES (?, ?, ?, NULL, ?)').run(id, type, at, reverted);

describe('statsBy', () => {
  test('sent, accepted (linkedin only), replied and median days by list and by column', () => {
    const db = seed();
    const a = contact(db, { list_id: 1, name: 'A', project_tag: 'RiskMesh', extra: '{"Track":"HW"}' });
    const b = contact(db, { list_id: 1, name: 'B', project_tag: 'RiskMesh', extra: '{"Track":"SW"}' });
    const c = contact(db, { list_id: 2, name: 'C', degree: '2nd' });
    const d = contact(db, { list_id: 2, name: 'D' });
    contact(db, { list_id: 2, name: 'Never sent' });
    ev(db, a, 'sent', '2026-09-01T00:00:00.000Z'); ev(db, a, 'replied', '2026-09-05T00:00:00.000Z');
    ev(db, b, 'sent', '2026-09-01T00:00:00.000Z'); ev(db, b, 'replied', '2026-09-02T00:00:00.000Z', 1); // reverted reply
    ev(db, c, 'sent', '2026-09-01T00:00:00.000Z'); ev(db, c, 'accepted', '2026-09-03T00:00:00.000Z'); ev(db, c, 'replied', '2026-09-11T00:00:00.000Z');
    ev(db, d, 'sent', '2026-09-01T00:00:00.000Z', 1); // reverted send → not counted
    expect(statsBy(db, 'list')).toEqual([
      { key: 'Profs', sent: 2, linkedinSent: 0, accepted: 0, replied: 1, medianDays: 4 },
      { key: 'HR', sent: 1, linkedinSent: 1, accepted: 1, replied: 1, medianDays: 10 },
    ]);
    expect(statsBy(db, 'all')).toEqual([{ key: 'All', sent: 3, linkedinSent: 1, accepted: 1, replied: 2, medianDays: 7 }]);
    expect(statsBy(db, 'col:Track').map(r => [r.key, r.sent])).toEqual([['(blank)', 1], ['HW', 1], ['SW', 1]]);
    expect(statsBy(db, 'project').map(r => [r.key, r.sent])).toEqual([['RiskMesh', 2], ['(none)', 1]]);
  });
});

describe('statsBy hardening', () => {
  test('a reply timestamped before the send gives medianDays 0', () => {
    const db = seed();
    const a = contact(db, { list_id: 1, name: 'A' });
    ev(db, a, 'sent', '2026-09-05T00:00:00.000Z'); ev(db, a, 'replied', '2026-09-01T00:00:00.000Z');
    expect(statsBy(db, 'all')[0].medianDays).toBe(0);
  });
  test("col:constructor returns string keys only and does not throw", () => {
    const db = seed();
    const a = contact(db, { list_id: 1, name: 'A', extra: '{"Track":"HW"}' });
    ev(db, a, 'sent', '2026-09-01T00:00:00.000Z');
    expect(statsBy(db, 'col:constructor').map(r => r.key)).toEqual(['(blank)']);
  });
});

describe('introGroups', () => {
  test('open contacts grouped by mutual (case-insensitive), biggest first, with last ask date', () => {
    const db = seed();
    const x = contact(db, { list_id: 2, name: 'X', mutual: 'Priya Example' });
    contact(db, { list_id: 2, name: 'Y', mutual: 'priya example ' });
    contact(db, { list_id: 2, name: 'Z', mutual: 'Sam Example', status: 'sent' });
    contact(db, { list_id: 2, name: 'Closed', mutual: 'Sam Example', status: 'closed' });
    ev(db, x, 'intro_requested', '2026-09-20T00:00:00.000Z');
    const g = introGroups(db);
    expect(g.map(x => [x.mutual, x.contacts.map(c => c.name)])).toEqual([['Priya Example', ['X', 'Y']], ['Sam Example', ['Z']]]);
    expect(g[0].contacts[0].asked_at).toBe('2026-09-20T00:00:00.000Z');
  });
});

describe('referenceDeadlines', () => {
  test('reference rows with next date + days, upcoming first, url from extra', () => {
    const db = seed();
    contact(db, { list_id: 3, name: 'Later', status: 'reference', deadline_dates: '["2026-11-30"]', extra: '{"url":"https://a.test"}' });
    contact(db, { list_id: 3, name: 'None', status: 'reference', deadline_text: 'not announced', extra: '{}' });
    contact(db, { list_id: 3, name: 'Soon', status: 'reference', deadline_dates: '["2026-09-01","2026-10-10"]', extra: '{"URL":"https://b.test"}' });
    expect(referenceDeadlines(db, '2026-09-30').map(r => [r.name, r.next, r.days, r.url])).toEqual([
      ['Soon', '2026-10-10', 10, 'https://b.test'], ['Later', '2026-11-30', 61, 'https://a.test'], ['None', null, null, null],
    ]);
  });
});
