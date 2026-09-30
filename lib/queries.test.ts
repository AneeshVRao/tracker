import { describe, expect, test } from 'vitest';
import { openDb, type DB } from './db';
import { bulkFollowUp, bulkSkip, closeStale, editContact, getContactDetail, getSettings, listContacts, LimitError, listSummaries, performAction, saveSettings, undoLast } from './queries';

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

  test('undoLast with an allow-list refuses to revert other event types', () => {
    const db = seed();
    performAction(db, 1, 'sent', undefined, now);
    editContact(db, 1, 'message', 'hello', now);
    expect(undoLast(db, 1, ['sent', 'skipped'])).toBe(false);
    expect(getContactDetail(db, 1)!.contact.status).toBe('sent');
    expect(undoLast(db, 1)).toBe(true); // plain undo reverts the edit
    expect(getContactDetail(db, 1)!.contact.status).toBe('sent');
    expect(undoLast(db, 1, ['sent', 'skipped'])).toBe(true);
    expect(getContactDetail(db, 1)!.contact.status).toBe('to_contact');
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
    expect(bulkFollowUp(db, [1, 2], '2026-10-10', now)).toBe(1);
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

describe('settings and bulk follow-up', () => {
  test('getSettings returns a copy; stored values override defaults', () => {
    const db = seed();
    const s = getSettings(db);
    s.email_nudge_days[0] = 99;
    expect(getSettings(db).email_nudge_days[0]).toBe(7);
    db.prepare("INSERT INTO settings (key, value) VALUES ('weekly_invite_cap', '40')").run();
    expect(getSettings(db).weekly_invite_cap).toBe(40);
  });
  test('bulkFollowUp only changes open contacts', () => {
    const db = seed();
    performAction(db, 2, 'skip', undefined, now);
    expect(bulkFollowUp(db, [1, 2], '2026-10-10', now)).toBe(1);
    expect(getContactDetail(db, 1)!.contact.follow_up_on).toBe('2026-10-10');
    expect(getContactDetail(db, 2)!.contact.follow_up_on).toBeNull();
  });
});

describe('limits and daily helpers', () => {
  test('linkedin cap blocks at 100%; override sends and logs limit_override', () => {
    const db = seed();
    db.prepare("INSERT INTO settings (key, value) VALUES ('weekly_invite_cap', '1')").run();
    db.prepare("INSERT INTO contacts (list_id, person_key, source_row, name, org, priority, status, extra) VALUES (2, 'k4', 3, 'Al', 'Acme', 2, 'to_contact', '{}')").run();
    performAction(db, 3, 'sent', undefined, now);
    expect(() => performAction(db, 4, 'sent', undefined, now)).toThrow(LimitError);
    expect(getContactDetail(db, 4, now)!.contact.status).toBe('to_contact');
    performAction(db, 4, 'sent', undefined, now, { override: true });
    const d = getContactDetail(db, 4, now)!;
    expect(d.contact.status).toBe('sent');
    expect(d.events.map(e => e.type)).toEqual(['sent', 'limit_override']);
    expect(d.invites).toEqual({ used: 2, cap: 1 });
  });
  test('email sends ignore the linkedin cap', () => {
    const db = seed();
    db.prepare("INSERT INTO settings (key, value) VALUES ('weekly_invite_cap', '1')").run();
    performAction(db, 3, 'sent', undefined, now);
    performAction(db, 1, 'sent', undefined, now);
    expect(getContactDetail(db, 1, now)!.contact.status).toBe('sent');
  });
  test('detail reports same-org sends today and the company max', () => {
    const db = seed();
    performAction(db, 1, 'sent', undefined, now); // Prof A @ IIT X (email)
    expect(getContactDetail(db, 3, now)).toMatchObject({ orgSentToday: 1, companyMax: 1 }); // also IIT X
    expect(getContactDetail(db, 2, now)!.orgSentToday).toBe(0);
    expect(getContactDetail(db, 1, now)!.invites).toBeNull();
  });
  test('closeStale closes due email contacts at step 3 only', () => {
    const db = seed();
    db.prepare("UPDATE contacts SET status = 'sent', followup_step = 3, follow_up_on = '2026-09-20' WHERE id = 1").run();
    db.prepare("UPDATE contacts SET status = 'sent', followup_step = 2, follow_up_on = '2026-09-20' WHERE id = 2").run();
    expect(closeStale(db, now)).toBe(1);
    expect(getContactDetail(db, 1, now)!.contact).toMatchObject({ status: 'closed', outcome: 'no_reply' });
    expect(getContactDetail(db, 2, now)!.contact.status).toBe('sent');
  });
});

describe('saveSettings', () => {
  const valid = {
    weekly_invite_cap: '80', company_daily_max: '2', nudge1: '5', nudge2: '6', linkedin_withdraw_days: '14',
    after_accept_followup_days: '4', checkin_days: '9', my_timezone: 'Europe/London', projects: 'ContextCraft, RiskMesh ,',
  };
  test('valid input is stored and read back', () => {
    const db = seed();
    saveSettings(db, valid);
    expect(getSettings(db)).toMatchObject({
      weekly_invite_cap: 80, company_daily_max: 2, email_nudge_days: [5, 6], linkedin_withdraw_days: 14,
      after_accept_followup_days: 4, checkin_days: 9, my_timezone: 'Europe/London', projects: ['ContextCraft', 'RiskMesh'],
    });
  });
  test.each([
    ['weekly_invite_cap', '0'], ['weekly_invite_cap', 'abc'], ['nudge2', '61'], ['checkin_days', '1.5'],
    ['my_timezone', 'Mars/Base'], ['my_timezone', ''], ['projects', ' , '],
  ])('rejects %s=%s and saves nothing', (k, v) => {
    const db = seed();
    expect(() => saveSettings(db, { ...valid, [k]: v })).toThrow();
    expect(db.prepare('SELECT COUNT(*) AS n FROM settings').get()).toEqual({ n: 0 });
  });
});

describe('deadline filter', () => {
  test('within N days uses the next deadline (manual if upcoming, else parsed)', () => {
    const db = seed();
    db.prepare("UPDATE contacts SET deadline_dates = '[\"2026-10-05\"]' WHERE id = 1").run();
    db.prepare("UPDATE contacts SET deadline_dates = '[\"2026-12-01\"]', deadline_manual = '2026-10-02' WHERE id = 2").run();
    db.prepare("UPDATE contacts SET deadline_dates = '[\"2026-10-03\"]', deadline_manual = '2026-09-01' WHERE id = 3").run();
    expect(listContacts(db, { within: 7 }, now).rows.map(r => r.id)).toEqual([1, 2, 3]);
    expect(listContacts(db, { within: 5 }, now).rows.map(r => r.id)).toEqual([2, 3]);
    expect(listContacts(db, { within: 7, list: 1 }, now).total).toBe(2);
  });
});
