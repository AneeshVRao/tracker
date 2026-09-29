import { describe, expect, test } from 'vitest';
import { openDb, type DB } from './db';
import { bulkFollowUp, bulkSkip, editContact, getContactDetail, listContacts, listSummaries, performAction, undoLast } from './queries';

const now = new Date('2026-09-29T06:00:00Z'); // 11:30 in Asia/Kolkata → today 2026-09-29

function seed(): DB {
  const db = openDb(':memory:');
  const list = db.prepare("INSERT INTO lists (name, kind, channel, source_file, source_sheet, header_sig, headers, mapping, imported_at) VALUES (?, 'contacts', ?, 'f.xlsx', ?, 'h', ?, '{}', 't')");
  list.run('Profs', 'email', 'Professors', JSON.stringify(['Name', 'Track']));
  list.run('Alumni', 'linkedin', 'Alumni', JSON.stringify(['Name', 'Branch']));
  const c = db.prepare('INSERT INTO contacts (list_id, person_key, source_row, name, org, email, priority, status, extra) VALUES (?,?,?,?,?,?,?,?,?)');
  c.run(1, 'a@x.edu', 2, 'Prof A', 'IIT X', 'a@x.edu', 3, 'to_contact', JSON.stringify({ Name: 'Prof A', Track: 'Hardware-Edge-AI' }));
  c.run(1, 'b@y.edu', 3, 'Prof B', 'IIT Y', 'b@y.edu', 1, 'to_contact', JSON.stringify({ Name: 'Prof B', Track: 'AI/ML-Software' }));
  c.run(2, 'a@x.edu', 2, 'Prof A', 'IIT X', null, 2, 'to_contact', JSON.stringify({ Name: 'Prof A', Branch: 'ECE' }));
  return db;
}

describe('actions', () => {
  test('performAction applies the machine and logs an event with prev', () => {
    const db = seed();
    performAction(db, 1, 'sent', undefined, now);
    const d = getContactDetail(db, 1)!;
    expect(d.contact).toMatchObject({ status: 'sent', followup_step: 1, follow_up_on: '2026-10-06', last_touch_at: now.toISOString() });
    expect(d.events[0]).toMatchObject({ type: 'sent', reverted: 0 });
    expect(JSON.parse(d.events[0].data!).prev).toMatchObject({ status: 'to_contact', follow_up_on: null });
    expect(d.canUndo).toBe(true);
  });

  test('illegal action throws and changes nothing', () => {
    const db = seed();
    expect(() => performAction(db, 1, 'accepted', undefined, now)).toThrow(/not allowed/);
    expect(getContactDetail(db, 1)!.events).toEqual([]);
  });

  test('undo restores fields and marks the event reverted; nothing left → false', () => {
    const db = seed();
    performAction(db, 1, 'sent', undefined, now);
    expect(undoLast(db, 1)).toBe(true);
    const d = getContactDetail(db, 1)!;
    expect(d.contact).toMatchObject({ status: 'to_contact', followup_step: 0, follow_up_on: null, sent_at: null, last_touch_at: null });
    expect(d.events[0].reverted).toBe(1);
    expect(d.canUndo).toBe(false);
    expect(undoLast(db, 1)).toBe(false);
  });

  test('editContact validates dates and is undoable', () => {
    const db = seed();
    expect(() => editContact(db, 1, 'follow_up_on', 'next week', now)).toThrow(/date/);
    editContact(db, 1, 'follow_up_on', '2026-10-01', now);
    expect(getContactDetail(db, 1)!.contact.follow_up_on).toBe('2026-10-01');
    undoLast(db, 1);
    expect(getContactDetail(db, 1)!.contact.follow_up_on).toBeNull();
    expect(() => editContact(db, 1, 'tz', 'Mars/Base', now)).toThrow(/time zone/);
    expect(() => editContact(db, 1, 'status' as never, 'sent', now)).toThrow(/field/);
  });

  test('bulk skip only touches to_contact rows', () => {
    const db = seed();
    performAction(db, 1, 'sent', undefined, now);
    expect(bulkSkip(db, [1, 2], now)).toBe(1);
    expect(getContactDetail(db, 2)!.contact.status).toBe('skipped');
    expect(bulkFollowUp(db, [1, 2], '2026-10-10', now)).toBe(2);
  });

  test('bulk ops validate before writing anything', () => {
    const db = seed();
    expect(() => bulkSkip(db, [2, 999], now)).toThrow(/not found/);
    expect(getContactDetail(db, 2)!.contact.status).toBe('to_contact');
    expect(() => bulkFollowUp(db, [1, 999], '2026-10-10', now)).toThrow(/not found/);
    expect(getContactDetail(db, 1)!.contact.follow_up_on).toBeNull();
    expect(() => bulkFollowUp(db, [1], 'soon', now)).toThrow(/date/);
  });

  test('undo reverts only the latest of chained actions', () => {
    const db = seed();
    performAction(db, 1, 'sent', undefined, now);
    performAction(db, 1, 'nudged', undefined, now);
    expect(getContactDetail(db, 1)!.contact.followup_step).toBe(2);
    undoLast(db, 1);
    const d = getContactDetail(db, 1)!;
    expect(d.contact).toMatchObject({ status: 'sent', followup_step: 1 });
    expect(d.events.map(e => e.reverted)).toEqual([1, 0]);
  });
});

describe('reads', () => {
  test('filters: list, status, search, extra column, priority sort', () => {
    const db = seed();
    expect(listContacts(db, {}).total).toBe(3);
    expect(listContacts(db, { list: 1 }).total).toBe(2);
    expect(listContacts(db, { q: 'iit y' }).rows.map(r => r.name)).toEqual(['Prof B']);
    expect(listContacts(db, { col: 'Track', val: 'hardware' }).rows.map(r => r.id)).toEqual([1]);
    expect(listContacts(db, { sort: 'priority' }).rows.map(r => r.id)).toEqual([1, 3, 2]);
    expect(listContacts(db, { sort: 'constructor' }).rows.map(r => r.id)).toEqual([1, 2, 3]);
    performAction(db, 2, 'skip', undefined, now);
    expect(listContacts(db, { status: 'open' }).total).toBe(2);
  });
  test('detail shows the same person in other lists', () =>
    expect(getContactDetail(seed(), 1)!.alsoIn).toEqual([{ list: 'Alumni', status: 'to_contact' }]));
  test('summaries count by status', () =>
    expect(listSummaries(seed())[0]).toMatchObject({ name: 'Profs', total: 2, to_contact: 2, pending: 0 }));
});

describe('listContacts hardening', () => {
  test('unknown or malformed col is ignored', () => {
    const db = seed();
    expect(listContacts(db, { col: 'Nope\\', val: 'x' }).total).toBe(3);
    expect(listContacts(db, { col: 'Track', val: 'hardware' }).total).toBe(1);
  });
  test('LIKE wildcards in q and val are literal', () => {
    const db = seed();
    expect(listContacts(db, { q: '%' }).total).toBe(0);
    expect(listContacts(db, { q: '_' }).total).toBe(0);
    expect(listContacts(db, { col: 'Track', val: '%' }).total).toBe(0);
  });
});
