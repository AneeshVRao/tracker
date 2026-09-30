import { describe, expect, test } from 'vitest';
import { openDb, type Contact, type DB } from './db';
import { DEFAULT_SETTINGS as cfg } from './rules';
import { activityStats, buildQueue, dueFollowUps, orgsSentToday, repliesWaiting, upcomingDeadlines } from './today';

const now = new Date('2026-09-29T06:00:00Z'); // 11:30 in Asia/Kolkata → today 2026-09-29
let n = 0;

function seed(): DB {
  const db = openDb(':memory:');
  const L = db.prepare("INSERT INTO lists (name, kind, channel, source_file, source_sheet, header_sig, headers, mapping, imported_at) VALUES (?, 'contacts', ?, 'f', ?, 'h', '[]', '{}', 't')");
  L.run('Profs', 'email', 'P');   // list 1
  L.run('HR', 'linkedin', 'H');   // list 2
  return db;
}
function contact(db: DB, o: Partial<Contact> & { list_id: number; name: string }): number {
  const row: Record<string, unknown> = {
    person_key: `k${++n}`, source_row: 2, org: null, priority: 2, status: 'to_contact', followup_step: 0,
    follow_up_on: null, degree: null, deadline_dates: '[]', deadline_manual: null, extra: '{}', ...o,
  };
  const cols = Object.keys(row);
  return Number(db.prepare(`INSERT INTO contacts (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .run(...cols.map(k => row[k] as string | number | null)).lastInsertRowid);
}
function event(db: DB, contactId: number, type: string, at: string, reverted = 0) {
  db.prepare('INSERT INTO events (contact_id, type, at, data, reverted) VALUES (?, ?, ?, NULL, ?)').run(contactId, type, at, reverted);
}

describe('activityStats', () => {
  test('rolling week of linkedin invites, today in my_timezone, replies', () => {
    const db = seed();
    const a = contact(db, { list_id: 2, name: 'A' });
    const b = contact(db, { list_id: 1, name: 'B' });
    event(db, a, 'sent', '2026-09-28T06:00:00.000Z');    // 1 day ago → counts toward the week
    event(db, a, 'sent', '2026-09-21T05:00:00.000Z');    // more than 7 days ago
    event(db, a, 'sent', '2026-09-27T06:00:00.000Z', 1); // reverted
    event(db, b, 'sent', '2026-09-28T19:00:00.000Z');    // email, 00:30 IST on the 29th → sent today
    event(db, b, 'replied', '2026-09-25T10:00:00.000Z');
    expect(activityStats(db, now, cfg)).toEqual({ invitesWeek: 1, cap: 100, sentToday: 1, repliesWeek: 1 });
  });
});

describe('orgsSentToday', () => {
  test('counts non-reverted sends per normalised org for today in my_timezone', () => {
    const db = seed();
    const a = contact(db, { list_id: 2, name: 'A', org: 'Cohere ' });
    const b = contact(db, { list_id: 2, name: 'B', org: 'cohere' });
    const c = contact(db, { list_id: 1, name: 'C', org: 'IIT X' });
    event(db, a, 'sent', '2026-09-29T01:00:00.000Z');
    event(db, b, 'sent', '2026-09-28T18:00:00.000Z');    // 23:30 IST on the 28th → yesterday
    event(db, c, 'sent', '2026-09-29T02:00:00.000Z', 1); // reverted
    expect([...orgsSentToday(db, now, cfg)]).toEqual([['cohere', 1]]);
  });
});

describe('dueFollowUps', () => {
  test('classifies due items; ignores future and closed', () => {
    const db = seed();
    const nudge = contact(db, { list_id: 1, name: 'N', status: 'sent', followup_step: 1, follow_up_on: '2026-09-29' });
    const stale = contact(db, { list_id: 1, name: 'S', status: 'sent', followup_step: 3, follow_up_on: '2026-09-20' });
    const acc = contact(db, { list_id: 2, name: 'A', status: 'accepted', followup_step: 1, follow_up_on: '2026-09-29' });
    const wd = contact(db, { list_id: 2, name: 'W', status: 'sent', followup_step: 1, follow_up_on: '2026-09-28' });
    const conv = contact(db, { list_id: 2, name: 'C', status: 'conversation', follow_up_on: '2026-09-29' });
    contact(db, { list_id: 1, name: 'Future', status: 'sent', followup_step: 1, follow_up_on: '2026-09-30' });
    contact(db, { list_id: 1, name: 'Closed', status: 'closed', follow_up_on: '2026-09-01' });
    expect(dueFollowUps(db, '2026-09-29').map(r => [r.id, r.due])).toEqual([
      [stale, 'close_stale'], [wd, 'withdraw'], [nudge, 'nudge'], [acc, 'message_after_accept'], [conv, 'check_in'],
    ]);
  });
});

describe('repliesWaiting', () => {
  test('replied contacts with their list name', () => {
    const db = seed();
    const r = contact(db, { list_id: 2, name: 'R', status: 'replied' });
    contact(db, { list_id: 2, name: 'X', status: 'sent' });
    expect(repliesWaiting(db).map(c => [c.id, c.list_name])).toEqual([[r, 'HR']]);
  });
});

describe('upcomingDeadlines', () => {
  test('next deadline within 21 days, soonest first, open contacts only', () => {
    const db = seed();
    const a = contact(db, { list_id: 1, name: 'A', deadline_dates: '["2026-04-03","2026-10-15"]' });
    contact(db, { list_id: 1, name: 'B', deadline_dates: '["2026-11-30"]' });
    const c = contact(db, { list_id: 1, name: 'C', deadline_dates: '["2026-11-30"]', deadline_manual: '2026-10-01' });
    contact(db, { list_id: 1, name: 'D', deadline_dates: '["2026-10-02"]', status: 'skipped' });
    contact(db, { list_id: 1, name: 'E', deadline_manual: '2026-09-01' });
    expect(upcomingDeadlines(db, '2026-09-29').map(r => [r.id, r.next, r.days])).toEqual([[c, '2026-10-01', 2], [a, '2026-10-15', 16]]);
  });
});

describe('buildQueue', () => {
  test('urgent deadlines first, then priority (+1 for 2nd degree), then sheet order; company spacing defers', () => {
    const db = seed();
    const low = contact(db, { list_id: 2, name: 'Low', priority: 1, source_row: 2 });
    const hi = contact(db, { list_id: 2, name: 'Hi', priority: 3, source_row: 3 });
    const second = contact(db, { list_id: 2, name: 'Second', priority: 2, degree: '2nd', source_row: 4 });
    const urgent = contact(db, { list_id: 1, name: 'Urgent', priority: 1, deadline_dates: '["2026-10-05"]', source_row: 5 });
    contact(db, { list_id: 2, name: 'Busy', priority: 3, org: 'Cohere', source_row: 6 });
    const done = contact(db, { list_id: 2, name: 'Done', status: 'sent', org: 'cohere' });
    event(db, done, 'sent', '2026-09-29T02:00:00.000Z');
    contact(db, { list_id: 1, name: 'Skipped', status: 'skipped' });
    const q = buildQueue(db, [1, 2], now, cfg);
    expect(q.items.map(i => i.id)).toEqual([urgent, hi, second, low]);
    expect(q.items[0].next_deadline).toBe('2026-10-05');
    expect(q.deferred).toBe(1);
    expect(buildQueue(db, [2], now, cfg).items.map(i => i.id)).toEqual([hi, second, low]);
    expect(buildQueue(db, [], now, cfg)).toEqual({ items: [], deferred: 0 });
  });
});

describe('duplicates in queue', () => {
  test('dup_list names another list where the same person was already contacted', () => {
    const db = seed();
    const a = contact(db, { list_id: 2, name: 'A', person_key: 'same' });
    contact(db, { list_id: 1, name: 'A too', person_key: 'same', status: 'sent' });
    const b = contact(db, { list_id: 2, name: 'B', person_key: 'solo' });
    const q = buildQueue(db, [2], now, cfg);
    expect(q.items.find(i => i.id === a)!.dup_list).toBe('Profs');
    expect(q.items.find(i => i.id === b)!.dup_list).toBeNull();
  });
});
