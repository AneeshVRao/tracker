# M3 Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Help decide who to contact and when. This plan covers a deadline radar, the recipient's best local time to send, warm-intro paths through mutual connections, what-gets-replies stats, and duplicate warnings across lists.

**Architecture:**
- Pure time-zone logic lives in `lib/besttime.ts`. It uses `Intl` only, with no library.
- Read-only insight queries live in `lib/insights.ts`.
- Small changes go into `lib/rules.ts` (deadline semantics), `lib/today.ts` (duplicate flag in the queue) and `lib/queries.ts` (deadline filter, intro logging).
- New pages are `/deadlines`, `/intros` and `/stats`. The contact panel and session mode gain a deadline editor, a best-time line and duplicate warnings.

**Tech Stack:** Node 24.15, Next.js 16.3.7 (React 19, Tailwind v4), `node:sqlite` (including `json_each`), vitest 5. No new dependencies.

**Spec:** `docs/specs/2026-09-29-outreach-tracker-design.md` (rev 2), milestone **M3** (§14): F9 Deadline radar, F10 Best time to send, F11 Warm intro paths, F12 What-gets-replies, F13 Duplicates.

## Global Constraints

- Local only, bound to `127.0.0.1`. Never commit or modify `data/`. Never print contact data into reports.
- No new dependencies. Time-zone conversion uses `Intl.DateTimeFormat(...).formatToParts` only.
- "Today" and all date maths use `my_timezone`. Date-only values are `YYYY-MM-DD`. Timestamps are ISO UTC.
- Next deadline = `deadline_manual` if it is set **and not in the past**, else the earliest parsed date ≥ today. (This replaces "manual always wins": a past manual date no longer hides future sheet dates.)
- Send window: `send_window = { days: [2,3,4], from: 9, to: 11 }`. The days are recipient-local weekdays, with Sunday = 0. The window is `from ≤ hour < to`, recipient-local.
- Country → time zone defaults: USA → America/New_York, Canada → America/Toronto, Australia → Australia/Sydney. For a multi-country cell like `India / USA`, the first country wins. The per-contact `tz` overrides the country.
- Stats count only non-reverted events. "Replied" means a non-reverted `replied` event. "Accepted %" applies to LinkedIn only and shows "—" for email. A group with n < 5 sent is shown greyed with "small sample".
- Duplicate: another contact with the same `person_key` in a different list whose status is not `to_contact`, `skipped` or `reference` counts as "already contacted".
- `lib/besttime.ts` and `lib/rules.ts` must stay client-safe. Client components import no `lib/db`, `lib/queries`, `lib/today` or `lib/insights` values.
- UI uses the existing tokens and classes: `.input .btn .btn-primary .nav .th .label .page-title .card` and `bg panel sunken fg muted line accent warn bad good`. Controls have accessible names. Messages have `role="alert"` or `role="status"`.
- Next.js 16 differs from older versions: read `node_modules/next/dist/docs/` before using its APIs.

## File Map

| File | Change | Responsibility |
|---|---|---|
| `lib/rules.ts` | modify | `nextDeadline` ignores a past manual date |
| `lib/queries.ts` | modify | `Filters.within` deadline filter; `markIntroRequested` |
| `lib/besttime.ts` | create | `COUNTRY_TZ`, `tzFor`, `localParts`, `inWindow`, `nextSlot`, `formatIn` |
| `lib/insights.ts` | create | `statsBy`, `introGroups`, `referenceDeadlines` |
| `lib/today.ts` | modify | `buildQueue` items carry `dup_list` |
| `app/actions.ts` | modify | `markIntroAsked` |
| `app/contacts/DeadlineEditor.tsx`, `app/contacts/TzOverride.tsx` | create | Panel editors |
| `app/contacts/ContactPanel.tsx`, `app/contacts/page.tsx` | modify | Deadline, best time and duplicate warning in the panel; "deadline within" filter |
| `app/deadlines/page.tsx` | create | F9 radar |
| `app/intros/page.tsx`, `app/intros/IntroCard.tsx` | create | F11 |
| `app/stats/page.tsx` | create | F12 |
| `app/session/page.tsx`, `app/session/Session.tsx` | modify | Best-time line and duplicate warning per item |
| `app/layout.tsx` | modify | Nav: Today, Session, Contacts, Deadlines, Intros, Stats, Lists, Import, Settings |

---

### Task 1: Deadline semantics and the "deadline within N days" filter

**Files:**
- Modify: `lib/rules.ts` (`nextDeadline`), `lib/queries.ts` (`Filters`, `listContacts`)
- Test: `lib/rules.test.ts`, `lib/queries.test.ts`

**Interfaces:**
- Produces:
  - `nextDeadline(dates, manual, today)` returns the manual date only when it is ≥ today.
  - `Filters.within?: number`.
  - `listContacts(db, f, now = new Date())`.

- [ ] **Step 1: Failing tests**

In `lib/rules.test.ts`, inside the existing `describe('dates')`, add:

```ts
  test('a past manual deadline falls back to parsed dates', () => {
    expect(nextDeadline(['2026-11-30'], '2026-09-01', today)).toBe('2026-11-30');
    expect(nextDeadline([], '2026-09-01', today)).toBeNull();
  });
```

Append to `lib/queries.test.ts`:

```ts
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
```

`now` is 2026-09-29 IST. Contact 3's manual date is in the past, so its parsed date, 10-03, applies.

- [ ] **Step 2: Run and confirm failure.** Run `npx vitest run lib/rules.test.ts lib/queries.test.ts`.

- [ ] **Step 3: Implement**

`lib/rules.ts`:

```ts
// `dates` must be sorted ascending. A manual date only wins while it is still upcoming.
export const nextDeadline = (dates: string[], manual: string | null, today: string) =>
  (manual && manual >= today ? manual : null) ?? dates.find(d => d >= today) ?? null;
```

In `lib/queries.ts`:
- Add `within?: number` to `Filters`.
- Change the signature to `listContacts(db: DB, f: Filters, now = new Date())`.
- Add this clause after the `conf` handling:

```ts
  if (f.within) {
    const today = todayIn(getSettings(db).my_timezone, now);
    const limit = addDays(today, f.within);
    add(`((deadline_manual >= ? AND deadline_manual <= ?)
      OR ((deadline_manual IS NULL OR deadline_manual < ?) AND EXISTS (SELECT 1 FROM json_each(deadline_dates) WHERE value >= ? AND value <= ?)))`,
      today, limit, today, today, limit);
  }
```

Import `addDays` from `./rules`.

- [ ] **Step 4: Run, then run the full suite, `npx tsc --noEmit` and `npm run build`.**
- [ ] **Step 5: Commit** with the message `feat: upcoming-only manual deadlines and deadline-within filter`.

---

### Task 2: Best time to send — `lib/besttime.ts`

**Files:**
- Create: `lib/besttime.ts`, `lib/besttime.test.ts`

**Interfaces:**
- Produces:
  - `COUNTRY_TZ: Record<string, string>`
  - `tzFor(country: string | null, override: string | null): string | null`
  - `localParts(d: Date, tz: string) → { day: number; hour: number; minute: number }`
  - `type SendWindow = { days: number[]; from: number; to: number }`
  - `inWindow(d, tz, w): boolean`
  - `nextSlot(now, tz, w): Date`
  - `formatIn(d, tz): string`

- [ ] **Step 1: Failing tests** in `lib/besttime.test.ts`

```ts
import { describe, expect, test } from 'vitest';
import { formatIn, inWindow, localParts, nextSlot, tzFor } from './besttime';

const w = { days: [2, 3, 4], from: 9, to: 11 };

describe('tzFor', () => {
  test.each([
    ['India', null, 'Asia/Kolkata'], ['India / USA', null, 'Asia/Kolkata'], ['USA', null, 'America/New_York'],
    ['United Kingdom', null, 'Europe/London'], ['Hong Kong', null, 'Asia/Hong_Kong'], ['UK', 'Europe/Paris', 'Europe/Paris'],
    ['Atlantis', null, null], [null, null, null],
  ] as const)('%s / %s → %s', (c, o, tz) => expect(tzFor(c, o)).toBe(tz));
});

describe('local time', () => {
  test('localParts in a +05:30 zone', () =>
    expect(localParts(new Date('2026-09-29T06:00:00Z'), 'Asia/Kolkata')).toEqual({ day: 2, hour: 11, minute: 30 }));
  test('inWindow uses recipient-local time', () => {
    expect(inWindow(new Date('2026-09-29T09:30:00Z'), 'Europe/London', w)).toBe(true);   // Tue 10:30 BST
    expect(inWindow(new Date('2026-09-29T10:30:00Z'), 'Europe/London', w)).toBe(false);  // Tue 11:30 BST
    expect(inWindow(new Date('2026-10-02T09:00:00Z'), 'Europe/London', w)).toBe(false);  // Fri
  });
  test('formatIn', () => expect(formatIn(new Date('2026-09-30T03:30:00Z'), 'Asia/Kolkata')).toBe('Wed 30 Sept, 09:00'));
});

describe('nextSlot', () => {
  test('inside the window → now', () => {
    const now = new Date('2026-09-29T09:30:00Z');
    expect(nextSlot(now, 'Europe/London', w)).toEqual(now);
  });
  test('after the window → next allowed day at from:00 local (half-hour zone)', () =>
    expect(nextSlot(new Date('2026-09-29T06:00:00Z'), 'Asia/Kolkata', w).toISOString()).toBe('2026-09-30T03:30:00.000Z'));
  test('before the window the same day', () =>
    expect(nextSlot(new Date('2026-09-29T06:00:00Z'), 'America/New_York', w).toISOString()).toBe('2026-09-29T13:00:00.000Z'));
  test('Friday → next Tuesday', () =>
    expect(nextSlot(new Date('2026-10-02T12:00:00Z'), 'Europe/London', w).toISOString()).toBe('2026-10-06T08:00:00.000Z'));
});
```

If the `formatIn` expectation differs only in the short month text (for example `Sep` versus `Sept`, which depends on the ICU version in Node 24), change the expected string to what `formatIn` actually prints, and say so in the report. Every other expectation is exact.

- [ ] **Step 2: Run and confirm failure.** Run `npx vitest run lib/besttime.test.ts`.

- [ ] **Step 3: Implement** `lib/besttime.ts`

```ts
export type SendWindow = { days: number[]; from: number; to: number };

export const COUNTRY_TZ: Record<string, string> = {
  india: 'Asia/Kolkata', usa: 'America/New_York', us: 'America/New_York', 'united states': 'America/New_York',
  uk: 'Europe/London', 'united kingdom': 'Europe/London', england: 'Europe/London', scotland: 'Europe/London',
  'hong kong': 'Asia/Hong_Kong', singapore: 'Asia/Singapore', canada: 'America/Toronto', netherlands: 'Europe/Amsterdam',
  australia: 'Australia/Sydney', switzerland: 'Europe/Zurich', china: 'Asia/Shanghai', japan: 'Asia/Tokyo',
  'south korea': 'Asia/Seoul', korea: 'Asia/Seoul', germany: 'Europe/Berlin', belgium: 'Europe/Brussels',
  france: 'Europe/Paris', italy: 'Europe/Rome', spain: 'Europe/Madrid', sweden: 'Europe/Stockholm',
  denmark: 'Europe/Copenhagen', norway: 'Europe/Oslo', finland: 'Europe/Helsinki', austria: 'Europe/Vienna',
  ireland: 'Europe/Dublin', israel: 'Asia/Jerusalem', uae: 'Asia/Dubai', 'united arab emirates': 'Asia/Dubai',
  taiwan: 'Asia/Taipei', 'new zealand': 'Pacific/Auckland', portugal: 'Europe/Lisbon', poland: 'Europe/Warsaw',
  'czech republic': 'Europe/Prague', greece: 'Europe/Athens', brazil: 'America/Sao_Paulo', mexico: 'America/Mexico_City',
  'saudi arabia': 'Asia/Riyadh', qatar: 'Asia/Qatar', malaysia: 'Asia/Kuala_Lumpur',
};

export function tzFor(country: string | null, override: string | null): string | null {
  if (override) return override;
  if (!country) return null;
  const first = country.split(/\/|,|;|\band\b/i)[0].trim().toLowerCase();
  return COUNTRY_TZ[first] ?? null;
}

const partsFmt = new Map<string, Intl.DateTimeFormat>();
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function localParts(d: Date, tz: string) {
  let f = partsFmt.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    partsFmt.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(d).map(x => [x.type, x.value]));
  return { day: DAYS.indexOf(p.weekday), hour: Number(p.hour), minute: Number(p.minute) };
}

export function inWindow(d: Date, tz: string, w: SendWindow): boolean {
  const l = localParts(d, tz);
  return w.days.includes(l.day) && l.hour >= w.from && l.hour < w.to;
}

const Q = 15 * 60_000; // every real UTC offset is a multiple of 15 minutes

export function nextSlot(now: Date, tz: string, w: SendWindow): Date {
  if (inWindow(now, tz, w)) return now;
  let t = Math.ceil(now.getTime() / Q) * Q;
  for (let i = 0; i < 8 * 96; i++, t += Q) {
    const l = localParts(new Date(t), tz);
    if (w.days.includes(l.day) && l.hour === w.from && l.minute === 0) return new Date(t);
  }
  throw new Error('No send slot in the next 8 days — check the send window');
}

export const formatIn = (d: Date, tz: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
```

- [ ] **Step 4: Run, then run the full suite and `npx tsc --noEmit`.**
- [ ] **Step 5: Commit** with the message `feat: recipient-local best time to send`.

---

### Task 3: Insight queries, intro logging and the duplicate flag in the queue

**Files:**
- Create: `lib/insights.ts`, `lib/insights.test.ts`
- Modify: `lib/queries.ts` (`markIntroRequested`), `lib/today.ts` (`QueueItem.dup_list`)
- Test: `lib/today.test.ts`, `lib/queries.test.ts`

**Interfaces:**
- Produces:
  - `type StatRow = { key: string; sent: number; linkedinSent: number; accepted: number; replied: number; medianDays: number | null }`
  - `statsBy(db, dim: string): StatRow[]`, where `dim` is one of `'all' | 'list' | 'project' | 'priority' | 'degree' | 'country' | 'col:<Header>'`
  - `type IntroContact = Listed & { asked_at: string | null }`
  - `introGroups(db): { mutual: string; contacts: IntroContact[] }[]`
  - `type RefDeadline = { id: number; name: string; org: string | null; list_name: string; deadline_text: string | null; next: string | null; days: number | null; url: string | null }`
  - `referenceDeadlines(db, today): RefDeadline[]`
  - `markIntroRequested(db, ids: number[], mutual: string, now?): number`
  - `QueueItem` gains `dup_list: string | null`

- [ ] **Step 1: Failing tests**

`lib/insights.test.ts`:

```ts
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
```

Add a test to `lib/today.test.ts` (it uses that file's existing `seed`, `contact` and `event` helpers):

```ts
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
```

Add a test to `lib/queries.test.ts` (import `markIntroRequested`):

```ts
test('markIntroRequested logs one intro_requested event per contact, validating ids first', () => {
  const db = seed();
  expect(() => markIntroRequested(db, [1, 999], 'Priya', now)).toThrow();
  expect(db.prepare("SELECT COUNT(*) AS n FROM events WHERE type = 'intro_requested'").get()).toEqual({ n: 0 });
  expect(markIntroRequested(db, [1, 3], 'Priya', now)).toBe(2);
  const e = db.prepare("SELECT contact_id, data FROM events WHERE type = 'intro_requested' ORDER BY contact_id").all() as { contact_id: number; data: string }[];
  expect(e.map(x => [x.contact_id, JSON.parse(x.data).mutual])).toEqual([[1, 'Priya'], [3, 'Priya']]);
});
```

- [ ] **Step 2: Run and confirm failure.**

- [ ] **Step 3: Implement**

`lib/insights.ts`:

```ts
import type { DB } from './db';
import { norm } from './parse';
import { nextDeadline } from './rules';
import type { Listed } from './today';

const DAY = 86_400_000;
const PRIORITY = ['', 'Low', 'Medium', 'High'];

export type StatRow = { key: string; sent: number; linkedinSent: number; accepted: number; replied: number; medianDays: number | null };
type Raw = {
  priority: number; degree: string | null; country: string | null; project_tag: string | null; extra: string;
  list_name: string; channel: 'email' | 'linkedin'; sent_at: string | null; replied_at: string | null; accepted: number;
};

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function statsBy(db: DB, dim: string): StatRow[] {
  const rows = db.prepare(`SELECT c.priority, c.degree, c.country, c.project_tag, c.extra, l.name AS list_name, l.channel,
      (SELECT MIN(at) FROM events e WHERE e.contact_id = c.id AND e.type = 'sent' AND e.reverted = 0) AS sent_at,
      (SELECT MIN(at) FROM events e WHERE e.contact_id = c.id AND e.type = 'replied' AND e.reverted = 0) AS replied_at,
      EXISTS (SELECT 1 FROM events e WHERE e.contact_id = c.id AND e.type = 'accepted' AND e.reverted = 0) AS accepted
    FROM contacts c JOIN lists l ON l.id = c.list_id WHERE l.kind = 'contacts'`).all() as Raw[];
  const keyOf = (r: Raw): string => {
    if (dim === 'list') return r.list_name;
    if (dim === 'project') return r.project_tag ?? '(none)';
    if (dim === 'priority') return PRIORITY[r.priority] ?? String(r.priority);
    if (dim === 'degree') return r.degree ?? '(unknown)';
    if (dim === 'country') return r.country ?? '(unknown)';
    if (dim.startsWith('col:')) return (JSON.parse(r.extra) as Record<string, string>)[dim.slice(4)] || '(blank)';
    return 'All';
  };
  const groups = new Map<string, { row: StatRow; days: number[] }>();
  for (const r of rows) {
    if (!r.sent_at) continue;
    const k = keyOf(r);
    const g = groups.get(k) ?? { row: { key: k, sent: 0, linkedinSent: 0, accepted: 0, replied: 0, medianDays: null }, days: [] };
    g.row.sent++;
    if (r.channel === 'linkedin') { g.row.linkedinSent++; if (r.accepted) g.row.accepted++; }
    if (r.replied_at) { g.row.replied++; g.days.push(Math.round((Date.parse(r.replied_at) - Date.parse(r.sent_at)) / DAY)); }
    groups.set(k, g);
  }
  return [...groups.values()]
    .map(g => ({ ...g.row, medianDays: median(g.days) }))
    .sort((a, b) => b.sent - a.sent || a.key.localeCompare(b.key));
}

export type IntroContact = Listed & { asked_at: string | null };

export function introGroups(db: DB): { mutual: string; contacts: IntroContact[] }[] {
  const rows = db.prepare(`SELECT c.*, l.name AS list_name, l.channel,
      (SELECT MAX(at) FROM events e WHERE e.contact_id = c.id AND e.type = 'intro_requested' AND e.reverted = 0) AS asked_at
    FROM contacts c JOIN lists l ON l.id = c.list_id
    WHERE l.kind = 'contacts' AND c.mutual IS NOT NULL AND c.status IN ('to_contact','sent') ORDER BY c.list_id, c.source_row, c.id`).all() as IntroContact[];
  const groups = new Map<string, { mutual: string; contacts: IntroContact[] }>();
  for (const r of rows) {
    const k = norm(r.mutual);
    if (!k) continue;
    const g = groups.get(k) ?? { mutual: r.mutual!.trim(), contacts: [] };
    g.contacts.push(r);
    groups.set(k, g);
  }
  return [...groups.values()].sort((a, b) => b.contacts.length - a.contacts.length || a.mutual.localeCompare(b.mutual));
}

export type RefDeadline = { id: number; name: string; org: string | null; list_name: string; deadline_text: string | null; next: string | null; days: number | null; url: string | null };

export function referenceDeadlines(db: DB, today: string): RefDeadline[] {
  const rows = db.prepare(`SELECT c.id, c.name, c.org, c.deadline_text, c.deadline_dates, c.deadline_manual, c.extra, l.name AS list_name
    FROM contacts c JOIN lists l ON l.id = c.list_id WHERE l.kind = 'reference' ORDER BY c.list_id, c.source_row`).all() as
    { id: number; name: string; org: string | null; deadline_text: string | null; deadline_dates: string; deadline_manual: string | null; extra: string; list_name: string }[];
  return rows.map(r => {
    const next = nextDeadline(JSON.parse(r.deadline_dates), r.deadline_manual, today);
    const extra = JSON.parse(r.extra) as Record<string, string>;
    const url = Object.entries(extra).find(([k, v]) => /^(url|link|website)$/i.test(k.trim()) && /^https?:\/\//i.test(v))?.[1] ?? null;
    return {
      id: r.id, name: r.name, org: r.org, list_name: r.list_name, deadline_text: r.deadline_text, url, next,
      days: next ? Math.round((Date.parse(next) - Date.parse(today)) / DAY) : null,
    };
  }).sort((a, b) => (a.next === null ? 1 : 0) - (b.next === null ? 1 : 0) || (a.next ?? '').localeCompare(b.next ?? ''));
}
```

`lib/insights.ts` imports the `Listed` type from `./today`. That is fine because `today.ts` does not import insights.

`lib/queries.ts`:

```ts
export function markIntroRequested(db: DB, ids: number[], mutual: string, now = new Date()): number {
  ids.forEach(id => mustGet(db, id));
  const ins = db.prepare("INSERT INTO events (contact_id, type, at, data) VALUES (?, 'intro_requested', ?, ?)");
  tx(db, () => { for (const id of ids) ins.run(id, now.toISOString(), JSON.stringify({ mutual })); });
  return ids.length;
}
```

In `lib/today.ts`, change `QueueItem` to `Listed & { next_deadline: string | null; dup_list: string | null }`, and replace the `rows` query in `buildQueue` with:

```ts
  const rows = db.prepare(`SELECT c.*, l.name AS list_name, l.channel,
      (SELECT l2.name FROM contacts c2 JOIN lists l2 ON l2.id = c2.list_id
        WHERE c2.person_key = c.person_key AND c2.id <> c.id AND c2.status NOT IN ('to_contact','skipped','reference') LIMIT 1) AS dup_list
    FROM contacts c JOIN lists l ON l.id = c.list_id
    WHERE l.kind = 'contacts' AND c.status = 'to_contact' AND c.list_id IN (${listIds.map(() => '?').join(', ')})`)
    .all(...listIds) as (Listed & { dup_list: string | null })[];
```

The existing loop spreads `r`, so `dup_list` carries through. Adjust the loop's element type if TypeScript asks.

- [ ] **Step 4: Run the focused tests, then the full suite, `npx tsc --noEmit` and `npm run build`.**
- [ ] **Step 5: Commit** with the message `feat: stats, intro groups, reference deadlines, intro logging, duplicate flag`.

---

### Task 4: Contact panel — deadline editor, best time, duplicate warning, "deadline within" filter

**Files:**
- Create: `app/contacts/DeadlineEditor.tsx`, `app/contacts/TzOverride.tsx`
- Modify: `app/contacts/ContactPanel.tsx`, `app/contacts/page.tsx`

**Interfaces:**
- Consumes:
  - `nextDeadline` and `todayIn` from `lib/rules`.
  - `tzFor`, `inWindow`, `nextSlot` and `formatIn` from `lib/besttime`.
  - `editContact(id, field, value)`, a server action that throws on invalid input.
  - `getSettings`.
  - `Filters.within` (Task 1).

- [ ] **Step 1:** Create `app/contacts/DeadlineEditor.tsx`

```tsx
'use client';

import { useState, useTransition } from 'react';
import { editContact } from '@/app/actions';

export function DeadlineEditor({ id, dates, manual, today }: { id: number; dates: string[]; manual: string | null; today: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const set = (v: string | null) => start(async () => {
    setError('');
    try { await editContact(id, 'deadline_manual', v); } catch { setError('Could not save that date.'); }
  });
  return (
    <div className="space-y-1.5">
      {dates.length > 0 && (
        <div className="flex flex-wrap gap-1" role="group" aria-label="Dates found in the sheet">
          {dates.map(d => (
            <button key={d} type="button" disabled={pending} onClick={() => set(d)}
              className={`rounded-full border px-2 py-px text-xs ${d === manual ? 'border-accent bg-accent/10 text-accent' : d < today ? 'border-line text-muted line-through' : 'border-line hover:border-fg/30'}`}
              aria-pressed={d === manual}>{d}</button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <input type="date" key={manual ?? ''} defaultValue={manual ?? ''} className="input" aria-label="Deadline to use"
          onBlur={e => { const v = e.target.value || null; if (v !== manual) set(v); }} />
        {manual && <button type="button" className="btn" disabled={pending} onClick={() => set(null)}>Use sheet dates</button>}
      </div>
      {error && <p role="alert" className="text-xs text-bad">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2:** Create `app/contacts/TzOverride.tsx`

```tsx
'use client';

import { useState, useTransition } from 'react';
import { editContact } from '@/app/actions';

export function TzOverride({ id, value }: { id: number; value: string | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  return (
    <span className="inline-flex items-center gap-1.5">
      <input key={value ?? ''} defaultValue={value ?? ''} placeholder="e.g. America/Los_Angeles" className="input w-52" aria-label="Recipient time zone override"
        disabled={pending}
        onBlur={e => {
          const v = e.target.value.trim() || null;
          if (v === value) return;
          start(async () => { setError(''); try { await editContact(id, 'tz', v); } catch { setError('Unknown time zone.'); } });
        }} />
      {error && <span role="alert" className="text-xs text-bad">{error}</span>}
    </span>
  );
}
```

- [ ] **Step 3:** In `app/contacts/ContactPanel.tsx`, add a "When" section after the follow-up row and before Notes. It is server-rendered.
  - Imports: `getSettings` is not available in a component without the DB, so `ContactPanel` gets new props `settings: Settings` and `now: Date`. Pass them from `app/contacts/page.tsx` as `settings={getSettings(db)} now={new Date()}`.

```tsx
const today = todayIn(settings.my_timezone, now);
const dates = JSON.parse(c.deadline_dates) as string[];
const next = nextDeadline(dates, c.deadline_manual, today);
const tz = tzFor(c.country, c.tz);
const good = channel === 'email' && tz ? inWindow(now, tz, settings.send_window) : false;
const slot = channel === 'email' && tz && !good ? nextSlot(now, tz, settings.send_window) : null;
const contacted = alsoIn.filter(a => !['to_contact', 'skipped'].includes(a.status));
```

  Markup:
  - Insert right after the header, when `contacted.length`: `<p role="alert" className="rounded-md border border-warn/40 bg-warn/10 px-2 py-1.5 text-xs text-warn">Already contacted via {contacted.map(a => `${a.list} (${STATUS_LABEL[a.status]})`).join(', ')}. Don't message the same person twice.</p>`
  - Add a section `<section className="space-y-2 border-t border-line pt-4">` containing:
    - `<h3 className="label">Deadline</h3>`, then:
      - `{next ? <p className="text-xs">Next: <span className="font-medium">{next}</span> · in {days}d</p> : <p className="text-xs text-muted">No upcoming deadline.</p>}`. Compute `days` as `Math.round((Date.parse(next) - Date.parse(today)) / 86400000)`.
      - `{c.deadline_text && <p className="text-xs text-muted">Sheet: {c.deadline_text}</p>}`
      - `<DeadlineEditor key={`d${c.id}-${c.deadline_manual ?? ''}`} id={c.id} dates={dates} manual={c.deadline_manual} today={today} />`
    - When `channel === 'email'`: `<h3 className="label pt-2">Best time to send</h3>`, then:
      - If `tz`:
        - `<p className="text-xs">Their time: {formatIn(now, tz)} ({tz})</p>`
        - If `good`, add `<p className="text-xs text-good">Good time to send now.</p>`.
        - Otherwise add `<p className="text-xs">Next good slot: {formatIn(slot!, tz)} their time = {formatIn(slot!, settings.my_timezone)} yours. Use Gmail's Schedule send.</p>`.
      - If no `tz`: `<p className="text-xs text-muted">Unknown time zone{c.country ? ` for "${c.country}"` : ''}.</p>`.
      - In both cases, add `<div className="text-xs">Override: <TzOverride key={`t${c.id}-${c.tz ?? ''}`} id={c.id} value={c.tz} /></div>`.

  If `inWindow` or `nextSlot` throws because the stored `tz` is somehow invalid, the panel must not crash. Wrap the tz block in a small helper that catches the error and treats the zone as unknown.

- [ ] **Step 4:** In `app/contacts/page.tsx`:
  - Add `within: num(sp.within)` to the `Filters` object.
  - Pass `now` to `listContacts(db, f, now)`, with `const now = new Date()` defined once.
  - Add this select right after the `conf` select:

```tsx
<select name="within" defaultValue={sp.within ?? ''} className="input" aria-label="Deadline within"><option value="">Any deadline</option><option value="7">Deadline ≤ 7 days</option><option value="21">Deadline ≤ 21 days</option><option value="60">Deadline ≤ 60 days</option></select>
```

  Also add `aria-label`s to the existing unlabeled filter selects: `List`, `Status`, `Priority`, `Email confidence`, `Column`, and `Sort`. Add `aria-label="Column contains"` to the `val` input and `aria-label="Search"` to the `q` input.

- [ ] **Step 5: Verify.**
  - Run `npx tsc --noEmit`, `npm test` and `npm run build`.
  - Start the dev server and `curl` each of these, expecting 200:
    - `/contacts?open=1` (the HTML contains "Deadline" and "Best time to send")
    - `/contacts?within=60`
    - `/contacts?open=300`
  - Don't submit edits against the real DB. Stop the server.
- [ ] **Step 6: Commit** with the message `feat: panel deadline editor, best time to send, duplicate warning; deadline filter`.

---

### Task 5: Deadline radar and Intros pages

**Files:**
- Create: `app/deadlines/page.tsx`, `app/intros/page.tsx`, `app/intros/IntroCard.tsx`
- Modify: `app/actions.ts` (`markIntroAsked`)

**Interfaces:**
- Consumes:
  - `upcomingDeadlines` (lib/today)
  - `referenceDeadlines` and `introGroups` (Task 3)
  - `markIntroRequested` (Task 3)
  - `getSettings`, `todayIn`
  - `StatusChip` and `Empty` from app/ui

- [ ] **Step 1:** Add the server action to `app/actions.ts`:

```ts
export async function markIntroAsked(ids: number[], mutual: string): Promise<{ ok: boolean; message: string }> {
  try {
    if (!Array.isArray(ids) || !ids.every(Number.isInteger) || typeof mutual !== 'string' || !mutual.trim()) throw new Error('Invalid request');
    q.markIntroRequested(getDb(), ids, mutual.trim());
    return { ok: true, message: `Logged intro request for ${ids.length}.` };
  } catch (e) { return { ok: false, message: message(e) }; }
  finally { refresh(); }
}
```

- [ ] **Step 2:** Create `app/deadlines/page.tsx`

```tsx
import Link from 'next/link';
import { Empty, StatusChip } from '@/app/ui';
import { getDb } from '@/lib/db';
import { referenceDeadlines } from '@/lib/insights';
import { getSettings } from '@/lib/queries';
import { todayIn } from '@/lib/rules';
import { upcomingDeadlines } from '@/lib/today';

const WINDOWS = [14, 30, 60, 120];

export default async function DeadlinesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const raw = Number([sp.within].flat()[0]);
  const within = WINDOWS.includes(raw) ? raw : 60;
  const db = getDb();
  const today = todayIn(getSettings(db).my_timezone, new Date());
  const contacts = upcomingDeadlines(db, today, within);
  const refs = referenceDeadlines(db, today);
  const tone = (d: number) => (d <= 7 ? 'text-bad' : d <= 21 ? 'text-warn' : 'text-muted');

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <header className="flex flex-wrap items-end gap-3">
        <h1 className="page-title mr-auto">Deadlines</h1>
        <nav aria-label="Window" className="flex gap-1">
          {WINDOWS.map(w => <Link key={w} href={`/deadlines?within=${w}`} className={w === within ? 'btn-primary' : 'btn'} aria-current={w === within ? 'page' : undefined}>{w} days</Link>)}
        </nav>
      </header>

      <section className="space-y-2">
        <h2 className="font-medium">Contacts with a deadline in the next {within} days ({contacts.length})</h2>
        {contacts.length === 0 ? <Empty>No contact deadlines in this window.</Empty> : (
          <div className="card divide-y divide-line">
            {contacts.map(c => (
              <div key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
                <span className={`w-28 font-mono text-xs tabular-nums ${tone(c.days)}`}>{c.next}</span>
                <span className={`w-16 text-xs ${tone(c.days)}`}>{c.days === 0 ? 'today' : `in ${c.days}d`}</span>
                <div className="min-w-0 flex-1">
                  <Link href={`/contacts?open=${c.id}`} className="font-medium hover:text-accent">{c.name}</Link>
                  <div className="truncate text-xs text-muted">{[c.org, c.list_name].filter(Boolean).join(' · ')}</div>
                </div>
                <StatusChip s={c.status} />
              </div>
            ))}
          </div>
        )}
      </section>

      {refs.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">Programmes and reference deadlines</h2>
          <div className="card divide-y divide-line">
            {refs.map(r => (
              <div key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
                <span className={`w-28 font-mono text-xs tabular-nums ${r.days === null ? 'text-muted' : tone(r.days)}`}>{r.next ?? '—'}</span>
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent">{r.name}</a> : r.name}</span>
                  <div className="truncate text-xs text-muted">{[r.org, r.list_name].filter(Boolean).join(' · ')}</div>
                  {r.deadline_text && <div className="text-xs text-muted">{r.deadline_text}</div>}
                </div>
                {r.days !== null && <span className={`text-xs ${tone(r.days)}`}>{r.days === 0 ? 'today' : `in ${r.days}d`}</span>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
```

`referenceDeadlines` only returns URLs that match `^https?://` (Task 3), so the external link is safe.

- [ ] **Step 3:** Create `app/intros/IntroCard.tsx`

```tsx
'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { markIntroAsked } from '@/app/actions';

type C = { id: number; name: string; org: string | null; role: string | null; list_name: string; asked_at: string | null };

export function IntroCard({ mutual, contacts }: { mutual: string; contacts: C[] }) {
  const first = mutual.split(/\s+/)[0];
  const who = contacts.map(c => (c.org ? `${c.name} (${c.org})` : c.name)).join(', ');
  const [text, setText] = useState(
    `Hi ${first}, hope you're doing well! I'm a third-year ECE student at NIT Warangal looking for internship opportunities. I noticed you're connected with ${who}. Would you be open to a quick intro? I'm happy to send a short blurb you can forward.\n\nThanks so much!\nAneesh`,
  );
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const lastAsked = contacts.map(c => c.asked_at).filter(Boolean).sort().at(-1);

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setMsg({ ok: true, text: 'Copied.' }); }
    catch { setMsg({ ok: false, text: "Couldn't copy — select the text and copy manually." }); }
  };

  return (
    <section className="card space-y-3 p-4">
      <header className="flex flex-wrap items-baseline gap-2">
        <h2 className="font-medium">{mutual}</h2>
        <span className="text-xs text-muted">knows {contacts.length} {contacts.length === 1 ? 'person' : 'people'} you want to reach</span>
        {lastAsked && <span className="ml-auto text-xs text-muted">Asked {lastAsked.slice(0, 10)}</span>}
      </header>
      <ul className="space-y-0.5 text-xs">
        {contacts.map(c => (
          <li key={c.id}>
            <Link href={`/contacts?open=${c.id}`} className="font-medium hover:text-accent">{c.name}</Link>
            <span className="text-muted"> · {[c.role, c.org, c.list_name].filter(Boolean).join(' · ')}</span>
          </li>
        ))}
      </ul>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={5} className="input w-full text-[13px] leading-relaxed" aria-label={`Intro request to ${mutual}`} />
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className="btn-primary" onClick={copy}>Copy message</button>
        <button type="button" className="btn" disabled={pending} onClick={() => start(async () => {
          const r = await markIntroAsked(contacts.map(c => c.id), mutual);
          setMsg({ ok: r.ok, text: r.message });
        })}>Mark as asked</button>
        {msg && <span role={msg.ok ? 'status' : 'alert'} className={`text-xs ${msg.ok ? 'text-good' : 'text-bad'}`}>{msg.text}</span>}
      </div>
    </section>
  );
}
```

- [ ] **Step 4:** Create `app/intros/page.tsx`

```tsx
import { Empty } from '@/app/ui';
import { getDb } from '@/lib/db';
import { introGroups } from '@/lib/insights';
import { IntroCard } from './IntroCard';

export default function IntrosPage() {
  const groups = introGroups(getDb());
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="page-title">Warm intros</h1>
      <p className="text-muted">Your 2nd-degree connections grouped by the mutual who could introduce you. One message to a mutual can open several doors. Only contacts you haven&apos;t heard back from are listed.</p>
      {groups.length === 0 ? <Empty>No mutual connections recorded yet. They come from a &ldquo;Degree / Mutuals&rdquo; column like &ldquo;2nd - mutual: Name&rdquo;.</Empty>
        : groups.map(g => (
          <IntroCard key={g.mutual} mutual={g.mutual}
            contacts={g.contacts.map(c => ({ id: c.id, name: c.name, org: c.org, role: c.role, list_name: c.list_name, asked_at: c.asked_at }))} />
        ))}
    </div>
  );
}
```

- [ ] **Step 5: Verify.**
  - Run `npx tsc --noEmit`, `npm test` and `npm run build`.
  - Start the dev server and `curl` these pages, expecting 200 from each:
    - `/deadlines`
    - `/deadlines?within=14`
    - `/intros` (the HTML contains "Warm intros")
  - Don't click anything. Stop the server.
  - In the report, include the counts of rendered sections and groups, but no names.
- [ ] **Step 6: Commit** with the message `feat: deadline radar and warm intro pages`.

---

### Task 6: Stats page, navigation, and session best-time and duplicate lines

**Files:**
- Create: `app/stats/page.tsx`
- Modify: `app/layout.tsx`, `app/session/page.tsx`, `app/session/Session.tsx`

**Interfaces:**
- Consumes:
  - `statsBy` (Task 3) and `listHeaders` (lib/queries).
  - `tzFor`, `inWindow`, `nextSlot` and `formatIn` (Task 2).
  - `QueueItem.dup_list` (Task 3).

- [ ] **Step 1:** Create `app/stats/page.tsx`

```tsx
import Link from 'next/link';
import { Empty } from '@/app/ui';
import { getDb } from '@/lib/db';
import { statsBy } from '@/lib/insights';
import { listHeaders } from '@/lib/queries';

const DIMS: [string, string][] = [['all', 'Overall'], ['list', 'List'], ['project', 'Project mentioned'], ['priority', 'Priority'], ['degree', 'Connection degree'], ['country', 'Country']];
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');

export default async function StatsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const db = getDb();
  const headers = listHeaders(db);
  const asked = [sp.dim].flat()[0] ?? 'list';
  const dim = DIMS.some(([k]) => k === asked) || (asked.startsWith('col:') && headers.includes(asked.slice(4))) ? asked : 'list';
  const rows = statsBy(db, dim);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <header className="flex flex-wrap items-end gap-3">
        <h1 className="page-title mr-auto">What gets replies</h1>
        <form action="/stats" className="flex items-center gap-1.5">
          <select name="dim" defaultValue={dim} className="input" aria-label="Group by">
            {DIMS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            <optgroup label="Sheet column">{headers.map(h => <option key={h} value={`col:${h}`}>{h}</option>)}</optgroup>
          </select>
          <button className="btn">Group</button>
        </form>
      </header>
      <p className="text-muted">Counts only contacts you marked sent. Accepted applies to LinkedIn invites. Groups with fewer than 5 sends are greyed out: too few to trust.</p>
      {rows.length === 0 ? <Empty>No sends yet. Stats appear once you start marking messages sent. <Link href="/session" className="text-accent underline">Start a session</Link>.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead><tr>
              <th className="th">Group</th><th className="th text-right">Sent</th><th className="th text-right">Accepted</th>
              <th className="th text-right">Replied</th><th className="th text-right">Reply rate</th><th className="th text-right">Median days to reply</th>
            </tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.key} className={`border-t border-line tabular-nums ${r.sent < 5 ? 'text-muted' : ''}`}>
                <td className="px-3 py-1.5">{r.key}{r.sent < 5 && <span className="ml-2 text-xs">small sample</span>}</td>
                <td className="px-3 text-right">{r.sent}</td>
                <td className="px-3 text-right">{r.linkedinSent ? `${r.accepted} (${pct(r.accepted, r.linkedinSent)})` : '—'}</td>
                <td className="px-3 text-right">{r.replied}</td>
                <td className="px-3 text-right">{pct(r.replied, r.sent)}</td>
                <td className="px-3 text-right">{r.medianDays ?? '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2:** In `app/layout.tsx`, the nav becomes:

```tsx
<Link href="/today" className="nav">Today</Link>
<Link href="/session" className="nav">Session</Link>
<Link href="/contacts" className="nav">Contacts</Link>
<Link href="/deadlines" className="nav">Deadlines</Link>
<Link href="/intros" className="nav">Intros</Link>
<Link href="/stats" className="nav">Stats</Link>
<Link href="/lists" className="nav">Lists</Link>
<Link href="/import" className="nav">Import</Link>
<Link href="/settings" className="nav">Settings</Link>
```

Keep the existing classes and wrapper exactly as they are; only the list of links changes.

- [ ] **Step 3:** Session: best-time and duplicate lines.
  - In `app/session/page.tsx`, while building each `SessionItem`, add:

```ts
const tz = c.channel === 'email' ? tzFor(c.country, c.tz) : null;
let best: SessionItem['best'] = null;
if (tz) {
  try {
    const good = inWindow(now, tz, cfg.send_window);
    best = { tz, theirs: formatIn(now, tz), good, slotTheirs: good ? null : formatIn(nextSlot(now, tz, cfg.send_window), tz), slotMine: good ? null : formatIn(nextSlot(now, tz, cfg.send_window), cfg.my_timezone) };
  } catch { best = null; }
}
// ...add to the returned item: best, dup_list: c.dup_list
```

  - In `app/session/Session.tsx`:
    - Extend `SessionItem` with `best: { tz: string; theirs: string; good: boolean; slotTheirs: string | null; slotMine: string | null } | null` and `dup_list: string | null`.
    - In the item header, after the list, priority and deadline line, render:

```tsx
{item.dup_list && <p role="alert" className="text-xs text-warn">Already contacted via {item.dup_list}. Don&apos;t message the same person twice — skip (K).</p>}
{item.best && (item.best.good
  ? <p className="text-xs text-good">Good time to send: it&apos;s {item.best.theirs} for them.</p>
  : <p className="text-xs text-muted">Their time {item.best.theirs}. Best slot {item.best.slotTheirs} theirs ({item.best.slotMine} yours). Use Gmail Schedule send.</p>)}
```

- [ ] **Step 4: Verify.**
  - Run `npx tsc --noEmit`, `npm test` and `npm run build`.
  - Start the dev server and `curl` these, expecting 200:
    - `/stats` (the HTML contains "What gets replies")
    - `/stats?dim=col:Track`
    - `/stats?dim=bogus`, which falls back to List
    - `/session?lists=1&n=3` (the HTML contains "Their time" or "Good time to send")
  - Stop the server.
- [ ] **Step 5: Commit** with the message `feat: stats page, navigation, session best-time and duplicate hints`.

---

### Task 7: Ponytail cleanup and task list

- [ ] **Step 1:** Invoke the `ponytail:ponytail-review` skill on `git diff <M3 base>..HEAD -- . ':!docs' ':!package-lock.json'`. Apply only behaviour-preserving deletions. Never remove validation, error handling, safety guards, accessibility attributes or tests. Record each finding as applied or rejected, with a reason.
- [ ] **Step 2:** In `docs/TASKS.md`: tick all M3 items (the "Known follow-ups" list stays as is — M3 resolves none of them) and add one line under "Known follow-ups": "Best-time slots use a fixed Tue–Thu 09:00–11:00 window (send_window is not editable in Settings yet)."
- [ ] **Step 3:** Run `npx tsc --noEmit`, `npm test` and `npm run build`, then commit with the message `chore: M3 ponytail cleanup and task list`.
