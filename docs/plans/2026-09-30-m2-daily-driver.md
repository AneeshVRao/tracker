# M2 Daily Driver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make daily outreach run from one place: a Today page that says what's due, a keyboard session mode that works through the queue, LinkedIn safety limits that the server enforces, and a settings page for the timings.

**Architecture:** New read-only queries live in `lib/today.ts` (stats, due lists, deadlines, the queue). Write paths stay in `lib/queries.ts`, which gains cap enforcement, `closeStale` and `saveSettings`. Message building moves into one pure function, `composeFor` in `lib/template.ts`, shared by the contact panel and session mode. New pages are `app/today`, `app/session` and `app/settings`; every mutation goes through `app/actions.ts`.

**Tech Stack:** Node 24.15, Next.js 16.3.7 (App Router, React 19, Tailwind v4), `node:sqlite`, `vitest` 5. No new dependencies.

**Spec:** `docs/specs/2026-09-29-outreach-tracker-design.md` (rev 2). This plan implements milestone **M2** (§14): F2 Today, F5 Session mode, F7 LinkedIn safety, F8 follow-up sequence surfacing, and the Settings page. It also clears the M1 follow-ups listed in `docs/TASKS.md` that M2 depends on.

## Global Constraints

- Runs locally only, with `next dev` / `next start` bound to `-H 127.0.0.1`. The DB is `data/tracker.db`; never commit `data/` or any `.xlsx`, and never print contact data into reports.
- No new dependencies.
- "Today" and all date maths use `my_timezone` (default `Asia/Kolkata`). Date-only values are `YYYY-MM-DD`; timestamps are ISO UTC strings.
- Open statuses are `to_contact, sent, accepted, replied, conversation`. Events with `reverted = 1` are ignored by every count and limit.
- The weekly LinkedIn cap is a rolling 7 days of non-reverted `sent` events on LinkedIn lists. Warn at 80%, block at 100%. Override is allowed and logs a `limit_override` event.
- Company spacing: a contact whose normalised org (`norm()` from `lib/parse.ts`) already has `company_daily_max` non-reverted `sent` events today, on any list, is left out of the queue and flagged in the panel.
- Session mode queue order: an open deadline within 21 days first (soonest first), then effective priority (`priority + 1` when degree is `2nd`, capped at 3), then `list_id`, then `source_row`.
- Session keys: `C` copy, `O` open, `S` mark sent and go to the next, `K` skip and go to the next, `E` edit message, `U` undo last, `←`/`→` previous/next without acting, `Esc` exit. Keys are ignored while typing in a textarea or input; `Esc` there only blurs.
- `lib/*.ts` use relative imports; `app/**` uses `@/`. Pure modules (`rules`, `template`, `parse`, `mapping`) must stay client-safe and must not import `lib/db` values (type imports are fine).
- UI uses the existing design tokens and classes in `app/globals.css`: `.input .btn .btn-primary .nav .th .label .page-title .card` and colours `bg panel sunken fg muted line accent warn bad good`. Every control gets an accessible name, messages get `role="alert"` or `role="status"`, and focus must be visible.
- Next.js 16 differs from older versions. Read `node_modules/next/dist/docs/` before using `useActionState`, `useRouter`, `searchParams` (a Promise) or server actions.

## File Map

| File | Change | Responsibility |
|---|---|---|
| `lib/rules.ts` | modify | Frozen defaults, `checkin_days`, `OPEN_STATUSES` |
| `lib/today.ts` | create | Read-only: `activityStats`, `orgsSentToday`, `dueFollowUps`, `repliesWaiting`, `upcomingDeadlines`, `buildQueue` |
| `lib/queries.ts` | modify | `getSettings` returns a copy; open-only `bulkFollowUp`; `LimitError` + cap check; `closeStale`; `saveSettings`; `getContactDetail` adds `invites`, `orgSentToday`, `companyMax` |
| `lib/template.ts` | modify | `composeFor(contact, list)` |
| `app/actions.ts` | modify | `actContact` returns `ActResult`; `closeStaleForm`; `saveSettingsAction` |
| `app/contacts/ContactActions.tsx`, `ContactPanel.tsx`, `Composer.tsx` | modify | Limit banner and "Send anyway", invite and company warnings, "Nothing to undo", `composeFor`, `data-cmd` hooks |
| `app/today/page.tsx`, `app/today/QuickAction.tsx` | create | F2 Today |
| `app/session/page.tsx`, `app/session/Session.tsx` | create | F5 Session mode |
| `app/settings/page.tsx`, `app/settings/SettingsForm.tsx` | create | Settings |
| `app/layout.tsx`, `app/page.tsx` | modify | Nav (Today, Session, Contacts, Lists, Import, Settings); home redirects to `/today` |

---

### Task 1: Settings safety, check-in interval, open-only bulk follow-up

**Files:**
- Modify: `lib/rules.ts`, `lib/queries.ts` (`getSettings`, `bulkFollowUp`)
- Test: `lib/rules.test.ts`, `lib/queries.test.ts`

**Interfaces:**
- Produces:
  - `type Settings`: an explicit type, now including `checkin_days: number`.
  - `DEFAULT_SETTINGS: Readonly<Settings>`: frozen.
  - `OPEN_STATUSES: Status[]`.
  - `getSettings(db): Settings`: a deep copy.
  - `bulkFollowUp(db, ids, date, now?) → number`: returns the count of open contacts changed.

- [ ] **Step 1: Write the failing tests**

Append to `lib/rules.test.ts`, inside a new `describe('settings')`:

```ts
describe('settings', () => {
  test('conversation and check-in use checkin_days', () => {
    const replied: State = { ...fresh, status: 'replied' };
    expect(applyAction(replied, 'email', 'conversation', ctx, { ...cfg, checkin_days: 3 }).patch.follow_up_on).toBe('2026-10-02');
    const conv: State = { ...fresh, status: 'conversation' };
    expect(applyAction(conv, 'linkedin', 'checked_in', ctx, { ...cfg, checkin_days: 10 }).patch.follow_up_on).toBe('2026-10-09');
  });
  test('defaults are frozen and include checkin_days', () => {
    expect(Object.isFrozen(cfg)).toBe(true);
    expect(cfg.checkin_days).toBe(7);
  });
});
```

Append to `lib/queries.test.ts` (add `getSettings` to the import from `./queries`):

```ts
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
```

In the existing test `'bulk skip only touches to_contact rows'`, change `expect(bulkFollowUp(db, [1, 2], '2026-10-10', now)).toBe(2);` to `.toBe(1);`, because contact 2 is skipped by then.

- [ ] **Step 2: Run to confirm they fail**

Run `npx vitest run lib/rules.test.ts lib/queries.test.ts`. Expect FAIL: `checkin_days` is undefined, the object is not frozen, the mutation leaks into the defaults, and `bulkFollowUp` returns 2.

- [ ] **Step 3: Implement**

In `lib/rules.ts`, replace the `DEFAULT_SETTINGS` / `Settings` block with:

```ts
export type Settings = {
  weekly_invite_cap: number;
  company_daily_max: number;
  email_nudge_days: [number, number]; // after send; after each nudge
  linkedin_withdraw_days: number;
  after_accept_followup_days: number;
  checkin_days: number;
  projects: string[];
  my_timezone: string;
  send_window: { days: number[]; from: number; to: number };
};

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  weekly_invite_cap: 100,
  company_daily_max: 1,
  email_nudge_days: [7, 7],
  linkedin_withdraw_days: 21,
  after_accept_followup_days: 7,
  checkin_days: 7,
  projects: ['ContextCraft', 'Uktam', 'RiskMesh', 'ShabdSetu'],
  my_timezone: 'Asia/Kolkata',
  send_window: { days: [2, 3, 4], from: 9, to: 11 },
});

export const OPEN_STATUSES: Status[] = ['to_contact', 'sent', 'accepted', 'replied', 'conversation'];
```

In `applyAction`, change the `conversation` case to `plus(cfg.checkin_days)`, and change the `checked_in` case to `plus(cfg.checkin_days)`.

In `lib/queries.ts`:

```ts
export function getSettings(db: DB): Settings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  return { ...structuredClone(DEFAULT_SETTINGS), ...Object.fromEntries(rows.map(r => [r.key, JSON.parse(r.value)])) } as Settings;
}
```

```ts
export function bulkFollowUp(db: DB, ids: number[], date: string, now = new Date()): number {
  const cs = ids.map(id => mustGet(db, id));
  if (!ISO_DATE.test(date)) throw new Error('Expected a YYYY-MM-DD date');
  const open = cs.filter(c => OPEN_STATUSES.includes(c.status));
  for (const c of open) editContact(db, c.id, 'follow_up_on', date, now);
  return open.length;
}
```

Add `OPEN_STATUSES` to the import from `./rules`. If `structuredClone` of the frozen object fails a type check, cast through `Settings`. The behaviour must stay the same: nested arrays are not shared.

- [ ] **Step 4: Run to confirm they pass, then the full suite**

Run `npx vitest run lib/rules.test.ts lib/queries.test.ts`, then `npm test` and `npx tsc --noEmit`. All should pass.

- [ ] **Step 5: Commit**

```bash
git add lib/rules.ts lib/rules.test.ts lib/queries.ts lib/queries.test.ts
git commit -m "feat: frozen settings, check-in interval, open-only bulk follow-up"
```

---

### Task 2: Read-only daily queries — `lib/today.ts`

**Files:**
- Create: `lib/today.ts`, `lib/today.test.ts`

**Interfaces:**
- Consumes:
  - From `./db`: `DB` and `Contact` (type).
  - From `./parse`: `norm`.
  - From `./rules`: `addDays`, `nextDeadline`, `todayIn`, `Settings`.
- Produces:
  - `activityStats(db, now: Date, cfg) → { invitesWeek: number; cap: number; sentToday: number; repliesWeek: number }`
  - `orgsSentToday(db, now, cfg) → Map<string, number>`, keyed by `norm(org)`.
  - `type DueKind = 'nudge' | 'close_stale' | 'message_after_accept' | 'withdraw' | 'check_in'`
  - `type Listed = Contact & { list_name: string; channel: 'email' | 'linkedin' }`
  - `dueFollowUps(db, today: string) → (Listed & { due: DueKind })[]`
  - `repliesWaiting(db) → Listed[]`
  - `upcomingDeadlines(db, today, within = 21) → (Listed & { next: string; days: number })[]`
  - `type QueueItem = Listed & { next_deadline: string | null }`
  - `buildQueue(db, listIds: number[], now, cfg) → { items: QueueItem[]; deferred: number }`

- [ ] **Step 1: Write the failing tests** in `lib/today.test.ts`

```ts
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
```

- [ ] **Step 2: Run to confirm it fails** (`Cannot find module './today'`)

Run `npx vitest run lib/today.test.ts`.

- [ ] **Step 3: Implement `lib/today.ts`**

```ts
import type { Contact, DB } from './db';
import { norm } from './parse';
import { addDays, nextDeadline, todayIn, type Settings } from './rules';

const DAY = 86_400_000;
const OPEN_SQL = "('to_contact','sent','accepted','replied','conversation')";

export type Listed = Contact & { list_name: string; channel: 'email' | 'linkedin' };
export type DueKind = 'nudge' | 'close_stale' | 'message_after_accept' | 'withdraw' | 'check_in';
export type QueueItem = Listed & { next_deadline: string | null };

const LISTED = "SELECT c.*, l.name AS list_name, l.channel FROM contacts c JOIN lists l ON l.id = c.list_id WHERE l.kind = 'contacts'";

export function activityStats(db: DB, now: Date, cfg: Settings) {
  const since = new Date(now.getTime() - 7 * DAY).toISOString();
  const rows = db.prepare(`SELECT e.type, e.at, l.channel FROM events e JOIN contacts c ON c.id = e.contact_id JOIN lists l ON l.id = c.list_id
    WHERE e.reverted = 0 AND e.type IN ('sent','replied') AND e.at >= ?`).all(since) as { type: string; at: string; channel: string }[];
  const today = todayIn(cfg.my_timezone, now);
  return {
    invitesWeek: rows.filter(r => r.type === 'sent' && r.channel === 'linkedin').length,
    cap: cfg.weekly_invite_cap,
    sentToday: rows.filter(r => r.type === 'sent' && todayIn(cfg.my_timezone, new Date(r.at)) === today).length,
    repliesWeek: rows.filter(r => r.type === 'replied').length,
  };
}

export function orgsSentToday(db: DB, now: Date, cfg: Settings): Map<string, number> {
  const since = new Date(now.getTime() - 2 * DAY).toISOString(); // any "today" in any timezone lies within 2 days
  const rows = db.prepare(`SELECT c.org, e.at FROM events e JOIN contacts c ON c.id = e.contact_id
    WHERE e.reverted = 0 AND e.type = 'sent' AND e.at >= ? AND c.org IS NOT NULL`).all(since) as { org: string; at: string }[];
  const today = todayIn(cfg.my_timezone, now);
  const m = new Map<string, number>();
  for (const r of rows) if (todayIn(cfg.my_timezone, new Date(r.at)) === today) m.set(norm(r.org), (m.get(norm(r.org)) ?? 0) + 1);
  return m;
}

export function dueFollowUps(db: DB, today: string): (Listed & { due: DueKind })[] {
  const rows = db.prepare(`${LISTED} AND c.follow_up_on IS NOT NULL AND c.follow_up_on <= ? AND c.status IN ('sent','accepted','conversation')
    ORDER BY c.follow_up_on, c.id`).all(today) as Listed[];
  return rows.map(r => ({
    ...r,
    due: r.status === 'accepted' ? 'message_after_accept'
      : r.status === 'conversation' ? 'check_in'
      : r.channel === 'linkedin' ? 'withdraw'
      : r.followup_step >= 3 ? 'close_stale' : 'nudge',
  }));
}

export const repliesWaiting = (db: DB) =>
  db.prepare(`${LISTED} AND c.status = 'replied' ORDER BY c.last_touch_at, c.id`).all() as Listed[];

export function upcomingDeadlines(db: DB, today: string, within = 21): (Listed & { next: string; days: number })[] {
  const rows = db.prepare(`${LISTED} AND c.status IN ${OPEN_SQL} AND (c.deadline_dates <> '[]' OR c.deadline_manual IS NOT NULL)`).all() as Listed[];
  const limit = addDays(today, within);
  const out: (Listed & { next: string; days: number })[] = [];
  for (const r of rows) {
    const next = nextDeadline(JSON.parse(r.deadline_dates), r.deadline_manual, today);
    if (next && next >= today && next <= limit) out.push({ ...r, next, days: Math.round((Date.parse(next) - Date.parse(today)) / DAY) });
  }
  return out.sort((a, b) => a.next.localeCompare(b.next) || a.id - b.id);
}

export function buildQueue(db: DB, listIds: number[], now: Date, cfg: Settings): { items: QueueItem[]; deferred: number } {
  if (!listIds.length) return { items: [], deferred: 0 };
  const rows = db.prepare(`${LISTED} AND c.status = 'to_contact' AND c.list_id IN (${listIds.map(() => '?').join(', ')})`).all(...listIds) as Listed[];
  const today = todayIn(cfg.my_timezone, now);
  const soon = addDays(today, 21);
  const sent = orgsSentToday(db, now, cfg);
  const items: QueueItem[] = [];
  let deferred = 0;
  for (const r of rows) {
    if (r.org && (sent.get(norm(r.org)) ?? 0) >= cfg.company_daily_max) { deferred++; continue; }
    const next = nextDeadline(JSON.parse(r.deadline_dates), r.deadline_manual, today);
    items.push({ ...r, next_deadline: next && next >= today ? next : null });
  }
  const urgent = (i: QueueItem) => i.next_deadline !== null && i.next_deadline <= soon;
  const eff = (i: QueueItem) => Math.min(3, i.priority + (i.degree === '2nd' ? 1 : 0));
  items.sort((a, b) =>
    Number(urgent(b)) - Number(urgent(a))
    || (urgent(a) && urgent(b) ? a.next_deadline!.localeCompare(b.next_deadline!) : 0)
    || eff(b) - eff(a) || a.list_id - b.list_id || a.source_row - b.source_row);
  return { items, deferred };
}
```

- [ ] **Step 4: Run to confirm it passes, then the full suite and typecheck**

Run `npx vitest run lib/today.test.ts`, then `npm test` and `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add lib/today.ts lib/today.test.ts
git commit -m "feat: daily queries for stats, due follow-ups, deadlines and session queue"
```

---

### Task 3: Enforced LinkedIn cap, closeStale, richer contact detail, action results

**Files:**
- Modify: `lib/queries.ts`, `app/actions.ts`, `app/contacts/ContactActions.tsx`, `app/contacts/ContactPanel.tsx`
- Test: `lib/queries.test.ts`

**Interfaces:**
- Consumes: `activityStats`, `orgsSentToday` (Task 2); `norm` (`lib/parse`).
- Produces:
  - In `lib/queries.ts`:
    - `class LimitError extends Error { used: number; cap: number }`
    - `performAction(db, id, action, outcome?, now?, opts?: { override?: boolean })`
    - `closeStale(db, now?) → number`
    - `getContactDetail(db, id, now?)`. Its `ContactDetail` gains `invites: { used: number; cap: number } | null`, `orgSentToday: number` and `companyMax: number`.
  - In `app/actions.ts`:
    - `type ActResult = { ok: true } | { ok: false; limit: { used: number; cap: number } } | { ok: false; error: string }`
    - `actContact(id, action, outcome?, override?) → Promise<ActResult>`
    - `closeStaleForm()`

- [ ] **Step 1: Write the failing tests** by appending to `lib/queries.test.ts`

Add `closeStale` and `LimitError` to the import from `./queries`.

```ts
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
```

- [ ] **Step 2: Run to confirm they fail**

Run `npx vitest run lib/queries.test.ts`.

- [ ] **Step 3: Implement in `lib/queries.ts`**

Add these imports:

```ts
import { norm } from './parse';
import { activityStats, orgsSentToday } from './today';
```

Add the error class:

```ts
export class LimitError extends Error {
  constructor(public used: number, public cap: number) {
    super(`Weekly LinkedIn invite cap reached (${used}/${cap})`);
  }
}
```

Replace `performAction` with:

```ts
export function performAction(db: DB, id: number, action: Action, outcome?: Outcome, now = new Date(), opts: { override?: boolean } = {}) {
  tx(db, () => {
    const c = mustGet(db, id);
    const list = getList(db, c.list_id)!;
    if (list.kind !== 'contacts' || !list.channel) throw new Error('Reference rows have no actions');
    const cfg = getSettings(db);
    if (action === 'sent' && list.channel === 'linkedin') {
      const s = activityStats(db, now, cfg);
      if (s.invitesWeek >= s.cap) {
        if (!opts.override) throw new LimitError(s.invitesWeek, s.cap);
        db.prepare("INSERT INTO events (contact_id, type, at, data) VALUES (?, 'limit_override', ?, ?)")
          .run(c.id, now.toISOString(), JSON.stringify({ used: s.invitesWeek, cap: s.cap }));
      }
    }
    const { patch, event } = applyAction(c, list.channel, action, { today: todayIn(cfg.my_timezone, now), now: now.toISOString(), outcome }, cfg);
    writePatch(db, c, patch as Record<string, SQLInputValue>, event, { action, outcome: outcome ?? null }, now);
  });
}
```

Add `closeStale`:

```ts
export function closeStale(db: DB, now = new Date()): number {
  const today = todayIn(getSettings(db).my_timezone, now);
  const ids = (db.prepare(`SELECT c.id FROM contacts c JOIN lists l ON l.id = c.list_id
    WHERE l.channel = 'email' AND c.status = 'sent' AND c.followup_step >= 3 AND c.follow_up_on <= ?`).all(today) as { id: number }[]).map(r => r.id);
  for (const id of ids) performAction(db, id, 'close', 'no_reply', now);
  return ids.length;
}
```

Extend `ContactDetail` and `getContactDetail`:

```ts
export type ContactDetail = {
  contact: Contact; list: List; events: EventRow[]; alsoIn: { list: string; status: Status }[]; canUndo: boolean;
  invites: { used: number; cap: number } | null; orgSentToday: number; companyMax: number;
};
export function getContactDetail(db: DB, id: number, now = new Date()): ContactDetail | null {
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id) as Contact | undefined;
  if (!contact) return null;
  const list = getList(db, contact.list_id)!;
  const cfg = getSettings(db);
  const events = db.prepare('SELECT * FROM events WHERE contact_id = ? ORDER BY id DESC').all(id) as EventRow[];
  const alsoIn = db.prepare("SELECT l.name AS list, c.status FROM contacts c JOIN lists l ON l.id = c.list_id WHERE c.person_key = ? AND c.id <> ? AND c.status <> 'reference'")
    .all(contact.person_key, id) as ContactDetail['alsoIn'];
  const stats = list.channel === 'linkedin' ? activityStats(db, now, cfg) : null;
  return {
    contact, list, events, alsoIn, canUndo: undoTarget(db, id) !== undefined,
    invites: stats && { used: stats.invitesWeek, cap: stats.cap },
    orgSentToday: contact.org ? orgsSentToday(db, now, cfg).get(norm(contact.org)) ?? 0 : 0,
    companyMax: cfg.company_daily_max,
  };
}
```

`lib/today.ts` must not import `lib/queries.ts`; the dependency runs one way only.

- [ ] **Step 4: Update `app/actions.ts`**

```ts
export type ActResult = { ok: true } | { ok: false; limit: { used: number; cap: number } } | { ok: false; error: string };

export async function actContact(id: number, action: Action, outcome?: Outcome, override = false): Promise<ActResult> {
  try {
    q.performAction(getDb(), id, action, outcome, new Date(), { override });
    return { ok: true };
  } catch (e) {
    if (e instanceof q.LimitError) return { ok: false, limit: { used: e.used, cap: e.cap } };
    return { ok: false, error: message(e) };
  } finally { refresh(); }
}

export async function closeStaleForm() { q.closeStale(getDb()); refresh(); }
```

`'use server'` files may only export async functions. If the type export `ActResult` triggers a Next error, move it to `app/act-result.ts`, a plain module, and import it from there. Record which option you chose.

- [ ] **Step 5: Update `app/contacts/ContactActions.tsx`**

The new props are `invites: { used: number; cap: number } | null`, `org: string | null`, `orgSentToday: number` and `companyMax: number`.

```tsx
'use client';

import { useState, useTransition } from 'react';
import { actContact, undoContact } from '@/app/actions';
import { ACTION_LABEL, OUTCOME_LABEL, type Action, type Outcome } from '@/lib/rules';

type Props = {
  id: number; actions: Action[]; outcomes: Outcome[]; canUndo: boolean;
  invites: { used: number; cap: number } | null; org: string | null; orgSentToday: number; companyMax: number;
};

export function ContactActions({ id, actions, outcomes, canUndo, invites, org, orgSentToday, companyMax }: Props) {
  const [pending, start] = useTransition();
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState('');
  const [limit, setLimit] = useState<{ used: number; cap: number } | null>(null);
  const [note, setNote] = useState('');

  const act = (action: Action, outcome?: Outcome, override = false) => start(async () => {
    setError(''); setNote('');
    const r = await actContact(id, action, outcome, override);
    if (r.ok) { setClosing(false); setLimit(null); return; }
    if ('limit' in r) setLimit(r.limit); else setError(r.error);
  });
  const undo = () => start(async () => {
    setError('');
    try { if (!(await undoContact(id))) setNote('Nothing to undo.'); } catch { setError('Undo failed. Reload and try again.'); }
  });
  const nearCap = invites && invites.used >= invites.cap * 0.8;

  return (
    <div className="space-y-2">
      {invites && actions.includes('sent') && (
        <p className={`text-xs ${nearCap ? 'text-warn' : 'text-muted'}`}>LinkedIn invites this week: {invites.used}/{invites.cap}</p>
      )}
      {org && orgSentToday >= companyMax && actions.includes('sent') && (
        <p className="text-xs text-warn">Already sent to {orgSentToday} {orgSentToday === 1 ? 'person' : 'people'} at {org} today. Consider waiting until tomorrow.</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {actions.filter(a => a !== 'close').map(a => (
          <button key={a} disabled={pending} onClick={() => act(a)} className={a === 'sent' ? 'btn-primary' : 'btn'}>{ACTION_LABEL[a]}</button>
        ))}
        {actions.includes('close') && <button className="btn" disabled={pending} onClick={() => setClosing(v => !v)}>{ACTION_LABEL.close}</button>}
        {canUndo && <button className="btn ml-auto" disabled={pending} onClick={undo}>Undo last</button>}
      </div>
      {closing && (
        <div className="flex flex-wrap gap-1.5 border-l-2 border-line pl-2">
          {outcomes.map(o => <button key={o} className="btn" disabled={pending} onClick={() => act('close', o)}>{OUTCOME_LABEL[o]}</button>)}
        </div>
      )}
      {limit && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-warn/40 bg-warn/10 px-2 py-1.5 text-xs text-warn">
          You&apos;ve sent {limit.used}/{limit.cap} LinkedIn invites this week. Sending more risks a restriction.
          <button className="btn" disabled={pending} onClick={() => act('sent', undefined, true)}>Send anyway</button>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-bad">{error}</p>}
      {note && <p role="status" className="text-xs text-muted">{note}</p>}
    </div>
  );
}
```

In `app/contacts/ContactPanel.tsx`, pass the new props:
`<ContactActions key={c.id} ... invites={d.invites} org={c.org} orgSentToday={d.orgSentToday} companyMax={d.companyMax} />`.

- [ ] **Step 6: Verify**

Run `npx vitest run lib/queries.test.ts`, `npm test`, `npx tsc --noEmit` and `npm run build`. All should pass.

- [ ] **Step 7: Commit**

```bash
git add lib/queries.ts lib/queries.test.ts app/actions.ts app/contacts/ContactActions.tsx app/contacts/ContactPanel.tsx
git commit -m "feat: enforce LinkedIn weekly cap with override, company spacing warning, closeStale"
```

---

### Task 4: `composeFor`, a single message builder

**Files:**
- Modify: `lib/template.ts`, `app/contacts/ContactPanel.tsx`, `app/contacts/Composer.tsx`
- Test: `lib/template.test.ts`

**Interfaces:**
- Produces:
  - `type Composed = { key: TemplateKey; subject: string; body: string; canSaveMessage: boolean }`
  - `composeFor(c: Pick<Contact, 'name'|'org'|'role'|'message'|'extra'|'status'|'followup_step'>, list: Pick<List, 'channel'|'templates'>): Composed | null`, which returns null for reference lists.
  - Composer DOM hooks: `data-cmd="copy"` on Copy, `data-cmd="open"` on Open, `data-cmd="edit"` on the textarea.

- [ ] **Step 1: Write the failing tests** by appending to `lib/template.test.ts`

Add `composeFor` to the import.

```ts
describe('composeFor', () => {
  const base = { name: 'Prof. Jane Doe', org: 'IIT Bombay', role: null, message: 'Angle', extra: JSON.stringify({ 'Most Relevant Paper(s)': 'RECAST' }), status: 'to_contact' as const, followup_step: 0 };
  const email = { channel: 'email' as const, templates: JSON.stringify({ subject: 'Hi {{org}}', body: 'Dear {{last_name}}: {{message}}', followup1: 'Nudge {{last_name}}', followup2: 'Last {{last_name}}', after_accept: '' }) };
  const linkedin = { channel: 'linkedin' as const, templates: JSON.stringify({ subject: '', body: '{{message}}', followup1: '', followup2: '', after_accept: 'Thanks {{first_name}}' }) };
  test('email first message', () =>
    expect(composeFor(base, email)).toEqual({ key: 'body', subject: 'Hi IIT Bombay', body: 'Dear Doe: Angle', canSaveMessage: false }));
  test('email second nudge uses Re: subject', () =>
    expect(composeFor({ ...base, status: 'sent', followup_step: 2 }, email)).toEqual({ key: 'followup2', subject: 'Re: Hi IIT Bombay', body: 'Last Jyothi', canSaveMessage: false }));
  test('linkedin note is saveable; after-accept is not', () => {
    expect(composeFor(base, linkedin)).toEqual({ key: 'body', subject: '', body: 'Angle', canSaveMessage: true });
    expect(composeFor({ ...base, status: 'accepted', followup_step: 1 }, linkedin)!.key).toBe('after_accept');
    expect(composeFor({ ...base, status: 'accepted', followup_step: 1 }, linkedin)!.canSaveMessage).toBe(false);
  });
  test('reference list → null', () => expect(composeFor(base, { channel: null, templates: '{}' })).toBeNull());
});
```

- [ ] **Step 2: Run to confirm it fails.** Run `npx vitest run lib/template.test.ts`.

- [ ] **Step 3: Implement** by appending to `lib/template.ts`

Add `import type { Contact, List } from './db';` at the top. It is type-only, so it is erased and the module stays client-safe.

```ts
export type Composed = { key: TemplateKey; subject: string; body: string; canSaveMessage: boolean };

export function composeFor(
  c: Pick<Contact, 'name' | 'org' | 'role' | 'message' | 'extra' | 'status' | 'followup_step'>,
  list: Pick<List, 'channel' | 'templates'>,
): Composed | null {
  if (!list.channel) return null;
  const tpl = JSON.parse(list.templates) as Partial<TemplateSet>;
  const key = pickTemplate(c.status, c.followup_step, list.channel);
  const ctx = { name: c.name, org: c.org, role: c.role, message: c.message, extra: JSON.parse(c.extra) as Record<string, string> };
  const subject = list.channel === 'email' ? render(key === 'body' ? tpl.subject ?? '' : `Re: ${tpl.subject ?? ''}`, ctx).text : '';
  return {
    key, subject, body: render(tpl[key] ?? '', ctx).text,
    canSaveMessage: list.channel === 'linkedin' && key === 'body' && (tpl.body ?? '').trim() === '{{message}}',
  };
}
```

In `app/contacts/ContactPanel.tsx`, delete the local `tpl`, `key`, `ctx`, `body` and `subject` computation. Keep `extra`, which the columns list uses. Replace it with `const composed = composeFor(c, list);` and render the Composer when `channel && composed` with `key={`${c.id}-${composed.key}`}`, `subject={composed.subject}`, `body={composed.body}` and `canSaveMessage={composed.canSaveMessage}`. Remove the now-unused `pickTemplate`, `render` and `TemplateSet` imports.

In `app/contacts/Composer.tsx`, add `data-cmd="copy"` to the Copy button, `data-cmd="open"` to the Open button and `data-cmd="edit"` to the textarea. Change nothing else.

- [ ] **Step 4: Verify**

Run `npx vitest run lib/template.test.ts`, `npm test`, `npx tsc --noEmit` and `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add lib/template.ts lib/template.test.ts app/contacts/ContactPanel.tsx app/contacts/Composer.tsx
git commit -m "refactor: composeFor shared message builder; composer command hooks"
```

---

### Task 5: Settings page

**Files:**
- Modify: `lib/queries.ts` (`saveSettings`), `app/actions.ts` (`saveSettingsAction`), `app/layout.tsx` (nav link)
- Create: `app/settings/page.tsx`, `app/settings/SettingsForm.tsx`
- Test: `lib/queries.test.ts`

**Interfaces:**
- Produces:
  - `saveSettings(db, input: Record<string, string>): void`. It throws `Error` with a user-facing message and writes nothing on invalid input. The form field names are `weekly_invite_cap`, `company_daily_max`, `nudge1`, `nudge2`, `linkedin_withdraw_days`, `after_accept_followup_days`, `checkin_days`, `my_timezone` and `projects`.
  - `saveSettingsAction(prev, fd) → Promise<{ ok: boolean; message: string }>`

- [ ] **Step 1: Write the failing tests** by appending to `lib/queries.test.ts`

Add `saveSettings` to the import.

```ts
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
```

- [ ] **Step 2: Run to confirm it fails.** Run `npx vitest run lib/queries.test.ts`.

- [ ] **Step 3: Implement `saveSettings`** in `lib/queries.ts`

```ts
const INT_FIELDS: [key: string, label: string, min: number, max: number][] = [
  ['weekly_invite_cap', 'Weekly LinkedIn invite cap', 1, 500],
  ['company_daily_max', 'Sends per company per day', 1, 20],
  ['nudge1', 'First nudge after (days)', 1, 60],
  ['nudge2', 'Second nudge after (days)', 1, 60],
  ['linkedin_withdraw_days', 'Withdraw invite after (days)', 1, 90],
  ['after_accept_followup_days', 'Message after accept within (days)', 1, 60],
  ['checkin_days', 'Check-in interval (days)', 1, 60],
];

export function saveSettings(db: DB, input: Record<string, string>) {
  const n: Record<string, number> = {};
  for (const [k, label, min, max] of INT_FIELDS) {
    const v = (input[k] ?? '').trim();
    if (!/^\d+$/.test(v) || +v < min || +v > max) throw new Error(`${label} must be a whole number from ${min} to ${max}`);
    n[k] = +v;
  }
  const tz = (input.my_timezone ?? '').trim();
  if (!tz) throw new Error('Time zone is required');
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { throw new Error(`Unknown time zone "${tz}"`); }
  const projects = (input.projects ?? '').split(',').map(p => p.trim()).filter(Boolean);
  if (!projects.length || projects.length > 20) throw new Error('List 1–20 project names, comma-separated');
  const values: Record<string, unknown> = {
    weekly_invite_cap: n.weekly_invite_cap, company_daily_max: n.company_daily_max, email_nudge_days: [n.nudge1, n.nudge2],
    linkedin_withdraw_days: n.linkedin_withdraw_days, after_accept_followup_days: n.after_accept_followup_days,
    checkin_days: n.checkin_days, my_timezone: tz, projects,
  };
  const up = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  tx(db, () => { for (const [k, v] of Object.entries(values)) up.run(k, JSON.stringify(v)); });
}
```

- [ ] **Step 4: Add the server action** to `app/actions.ts`

```ts
export async function saveSettingsAction(_prev: unknown, fd: FormData): Promise<{ ok: boolean; message: string }> {
  try {
    q.saveSettings(getDb(), Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)])));
    refresh();
    return { ok: true, message: 'Saved.' };
  } catch (e) { return { ok: false, message: message(e) }; }
}
```

- [ ] **Step 5: Add the page and form**

`app/settings/page.tsx`:

```tsx
import { getDb } from '@/lib/db';
import { getSettings } from '@/lib/queries';
import { SettingsForm } from './SettingsForm';

export default function SettingsPage() {
  const s = getSettings(getDb());
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="page-title">Settings</h1>
      <p className="text-muted">Timings for follow-ups and the LinkedIn safety limits. Changes apply to the next action you take; existing follow-up dates stay as they are.</p>
      <SettingsForm s={s} />
    </div>
  );
}
```

`app/settings/SettingsForm.tsx`:

```tsx
'use client';

import { useActionState } from 'react';
import { saveSettingsAction } from '@/app/actions';
import type { Settings } from '@/lib/rules';

const ROWS = (s: Settings): [name: string, label: string, value: string | number, hint: string][] => [
  ['weekly_invite_cap', 'Weekly LinkedIn invite cap', s.weekly_invite_cap, 'Rolling 7 days. Warns at 80%, asks before going over.'],
  ['company_daily_max', 'Sends per company per day', s.company_daily_max, 'Across all lists. Extra people at the same organisation wait for tomorrow.'],
  ['nudge1', 'First email nudge after (days)', s.email_nudge_days[0], 'Counted from the day you sent the email.'],
  ['nudge2', 'Second nudge after (days)', s.email_nudge_days[1], 'Counted from the first nudge. Close as no reply comes the same number of days after the second.'],
  ['linkedin_withdraw_days', 'Withdraw pending invite after (days)', s.linkedin_withdraw_days, 'Unaccepted invites show up on Today to withdraw.'],
  ['after_accept_followup_days', 'Follow up after message (days)', s.after_accept_followup_days, 'After they accept and you message them.'],
  ['checkin_days', 'Check-in interval (days)', s.checkin_days, 'For contacts you are in conversation with.'],
  ['my_timezone', 'Your time zone', s.my_timezone, 'IANA name, e.g. Asia/Kolkata. Decides what "today" means.'],
  ['projects', 'Projects to track in notes', s.projects.join(', '), 'Comma-separated. Used to see which project gets replies.'],
];

export function SettingsForm({ s }: { s: Settings }) {
  const [state, action, pending] = useActionState(saveSettingsAction, null);
  return (
    <form action={action} className="card divide-y divide-line">
      {ROWS(s).map(([name, label, value, hint]) => (
        <label key={name} className="grid gap-1 px-4 py-3 sm:grid-cols-[15rem_12rem_1fr] sm:items-center sm:gap-3">
          <span className="font-medium">{label}</span>
          <input name={name} defaultValue={String(value)} className="input" />
          <span className="text-xs text-muted">{hint}</span>
        </label>
      ))}
      <div className="flex items-center gap-3 px-4 py-3">
        <button className="btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Save settings'}</button>
        {state && <p role={state.ok ? 'status' : 'alert'} className={`text-xs ${state.ok ? 'text-good' : 'text-bad'}`}>{state.message}</p>}
      </div>
    </form>
  );
}
```

In `app/layout.tsx`, add `<Link href="/settings" className="nav">Settings</Link>` after Import.

- [ ] **Step 6: Verify**

Run `npx vitest run lib/queries.test.ts`, `npm test`, `npx tsc --noEmit` and `npm run build`. Then smoke-test with the dev server: `curl` `/settings` returns 200. Stop the server afterwards.

- [ ] **Step 7: Commit**

```bash
git add lib/queries.ts lib/queries.test.ts app/actions.ts app/settings app/layout.tsx
git commit -m "feat: settings page with validated timings and limits"
```

---

### Task 6: Today page (F2)

**Files:**
- Create: `app/today/page.tsx`, `app/today/QuickAction.tsx`
- Modify: `app/layout.tsx` (nav order), `app/page.tsx` (redirect to `/today`)

**Interfaces:**
- Consumes:
  - From `lib/today.ts` (Task 2): `activityStats`, `dueFollowUps`, `repliesWaiting`, `upcomingDeadlines`, `buildQueue`, `DueKind`.
  - `getSettings` and `listSummaries` from `lib/queries.ts`.
  - `todayIn` from `lib/rules.ts`.
  - From `app/actions.ts` (Task 3): `actContact` and `closeStaleForm`.
  - `StatusChip` and `Empty` from `app/ui.tsx`.

- [ ] **Step 1: Quick action button** in `app/today/QuickAction.tsx`

```tsx
'use client';

import { useState, useTransition } from 'react';
import { actContact } from '@/app/actions';
import type { Action, Outcome } from '@/lib/rules';

export function QuickAction({ id, action, outcome, label }: { id: number; action: Action; outcome?: Outcome; label: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  return (
    <span className="inline-flex items-center gap-2">
      <button className="btn" disabled={pending} onClick={() => start(async () => {
        const r = await actContact(id, action, outcome);
        setError(r.ok ? '' : 'error' in r ? r.error : 'Weekly invite cap reached');
      })}>{label}</button>
      {error && <span role="alert" className="text-xs text-bad">{error}</span>}
    </span>
  );
}
```

- [ ] **Step 2: Page** in `app/today/page.tsx`

```tsx
import Link from 'next/link';
import { closeStaleForm } from '@/app/actions';
import { Empty, StatusChip } from '@/app/ui';
import { getDb } from '@/lib/db';
import { getSettings, listSummaries } from '@/lib/queries';
import { todayIn, type Action, type Outcome } from '@/lib/rules';
import { activityStats, buildQueue, dueFollowUps, repliesWaiting, upcomingDeadlines, type DueKind } from '@/lib/today';
import { QuickAction } from './QuickAction';

const DUE: Record<DueKind, { title: string; action: Action; outcome?: Outcome; label: string }> = {
  nudge: { title: 'Email nudges due', action: 'nudged', label: 'Nudge sent' },
  close_stale: { title: 'No reply after two nudges', action: 'close', outcome: 'no_reply', label: 'Close' },
  message_after_accept: { title: 'Accepted: send a message', action: 'messaged', label: 'Message sent' },
  withdraw: { title: 'Invites pending too long: withdraw', action: 'close', outcome: 'withdrawn', label: 'Withdrawn' },
  check_in: { title: 'Check in', action: 'checked_in', label: 'Checked in' },
};
const ORDER: DueKind[] = ['message_after_accept', 'nudge', 'check_in', 'withdraw', 'close_stale'];

export default function TodayPage() {
  const db = getDb();
  const now = new Date();
  const cfg = getSettings(db);
  const today = todayIn(cfg.my_timezone, now);
  const lists = listSummaries(db).filter(l => l.kind === 'contacts');
  if (!lists.length) return <Empty>Nothing to do yet. <Link href="/import" className="text-accent underline">Import a workbook</Link> to start.</Empty>;

  const stats = activityStats(db, now, cfg);
  const deadlines = upcomingDeadlines(db, today);
  const due = dueFollowUps(db, today);
  const replies = repliesWaiting(db);
  const nextUp = lists.map(l => ({ l, ...buildQueue(db, [l.id], now, cfg) }));
  const pct = stats.invitesWeek / stats.cap;
  const open = (id: number) => `/contacts?open=${id}`;

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <header className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <h1 className="page-title mr-auto">Today <span className="font-normal text-muted">{today}</span></h1>
        <Stat label="LinkedIn invites this week" value={`${stats.invitesWeek}/${stats.cap}`} tone={pct >= 1 ? 'text-bad' : pct >= 0.8 ? 'text-warn' : ''} />
        <Stat label="Sent today" value={stats.sentToday} />
        <Stat label="Replies this week" value={stats.repliesWeek} />
        <Link href="/session" className="btn-primary">Start session</Link>
      </header>

      {deadlines.length > 0 && (
        <Section title={`Deadlines in the next 21 days (${deadlines.length})`}>
          {deadlines.map(d => (
            <Row key={d.id} href={open(d.id)} name={d.name} sub={[d.org, d.list_name].filter(Boolean).join(' · ')}>
              <span className={`tabular-nums text-xs ${d.days <= 7 ? 'text-bad' : 'text-warn'}`}>{d.next} · {d.days === 0 ? 'today' : `in ${d.days}d`}</span>
              <StatusChip s={d.status} />
            </Row>
          ))}
        </Section>
      )}

      {ORDER.map(kind => {
        const rows = due.filter(r => r.due === kind);
        if (!rows.length) return null;
        const d = DUE[kind];
        return (
          <Section key={kind} title={`${d.title} (${rows.length})`} extra={kind === 'close_stale' && (
            <form action={closeStaleForm}><button className="btn">Close all {rows.length} as no reply</button></form>
          )}>
            {rows.map(r => (
              <Row key={r.id} href={open(r.id)} name={r.name} sub={[r.org, r.list_name].filter(Boolean).join(' · ')}>
                <span className="tabular-nums text-xs text-muted">due {r.follow_up_on}</span>
                <QuickAction id={r.id} action={d.action} outcome={d.outcome} label={d.label} />
              </Row>
            ))}
          </Section>
        );
      })}

      {replies.length > 0 && (
        <Section title={`Replies waiting for you (${replies.length})`}>
          {replies.map(r => (
            <Row key={r.id} href={open(r.id)} name={r.name} sub={[r.org, r.list_name].filter(Boolean).join(' · ')}>
              <QuickAction id={r.id} action="conversation" label="In conversation" />
            </Row>
          ))}
        </Section>
      )}

      <Section title="Next up">
        {nextUp.map(({ l, items, deferred }) => (
          <div key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
            <span className="w-48 font-medium">{l.name}</span>
            <span className="text-xs text-muted">{items.length} ready{deferred ? ` · ${deferred} waiting (company spacing)` : ''}</span>
            <span className="min-w-0 flex-1 truncate text-xs text-muted">{items.slice(0, 5).map(i => i.name).join(', ')}</span>
            {items.length > 0 && <Link href={`/session?lists=${l.id}`} className="btn">Session</Link>}
          </div>
        ))}
      </Section>

      {!deadlines.length && !due.length && !replies.length && <p className="text-muted">No follow-ups due. Start a session to send new messages.</p>}
    </div>
  );
}

function Stat({ label, value, tone = '' }: { label: string; value: string | number; tone?: string }) {
  return <div><div className="label">{label}</div><div className={`text-lg font-semibold tabular-nums ${tone}`}>{value}</div></div>;
}

function Section({ title, extra, children }: { title: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-3"><h2 className="font-medium">{title}</h2><div className="ml-auto">{extra}</div></div>
      <div className="card divide-y divide-line">{children}</div>
    </section>
  );
}

function Row({ href, name, sub, children }: { href: string; name: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <Link href={href} className="font-medium hover:text-accent">{name}</Link>
        <div className="truncate text-xs text-muted">{sub}</div>
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Navigation and home**

In `app/layout.tsx`, the nav order becomes Today (`/today`), Session (`/session`), Contacts, Lists, Import, Settings.

`app/page.tsx` becomes `redirect('/today')`.

- [ ] **Step 4: Verify**

Run `npx tsc --noEmit`, `npm test` and `npm run build`. Then run the dev server and check:
- `curl` `/today` returns 200 and the HTML contains "Today" and "Next up".
- `curl -sI /` shows a redirect to `/today`.

Stop the server.

- [ ] **Step 5: Commit**

```bash
git add app/today app/layout.tsx app/page.tsx
git commit -m "feat: Today page with deadlines, due follow-ups, replies and next-up queue"
```

---

### Task 7: Session mode (F5)

**Files:**
- Create: `app/session/page.tsx`, `app/session/Session.tsx`

**Interfaces:**
- Consumes:
  - `buildQueue`, `activityStats`, `orgsSentToday` (Task 2).
  - `composeFor` (Task 4).
  - `actContact` returning `ActResult` (Task 3), and `undoContact`.
  - `Composer` from `@/app/contacts/Composer` with its `data-cmd` hooks (Task 4).
  - `getList`, `getSettings`, `listSummaries`.
  - `norm` from `lib/parse` (client-safe).
- Produces: the `/session` route. With no `lists` param it shows a picker; `?lists=1,3&n=30` runs a batch.

- [ ] **Step 1: Server page** in `app/session/page.tsx`

```tsx
import Link from 'next/link';
import { Empty } from '@/app/ui';
import { getDb } from '@/lib/db';
import { getList, getSettings, listSummaries } from '@/lib/queries';
import { composeFor } from '@/lib/template';
import { activityStats, buildQueue, orgsSentToday } from '@/lib/today';
import { Session, type SessionItem } from './Session';

type SP = Record<string, string | string[] | undefined>;

export default async function SessionPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
  const db = getDb();
  const lists = listSummaries(db).filter(l => l.kind === 'contacts');
  if (!lists.length) return <Empty>No lists yet. <Link href="/import" className="text-accent underline">Import a workbook</Link>.</Empty>;
  // checkboxes submit lists=1&lists=3; Today links use lists=1,3 — accept both
  const ids = [sp.lists].flat().filter(Boolean).join(',').split(',').map(Number).filter(id => lists.some(l => l.id === id));
  const n = Math.min(100, Math.max(1, Number(one(sp.n)) || 30));

  if (!ids.length) return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="page-title">Start a session</h1>
      <p className="text-muted">Pick the lists to work through. Contacts are ordered by upcoming deadline, then priority. People at an organisation you already contacted today are held back.</p>
      <form action="/session" className="card space-y-3 p-4">
        <fieldset className="space-y-2">
          <legend className="label mb-1">Lists</legend>
          {lists.map(l => (
            <label key={l.id} className="flex items-center gap-2">
              <input type="checkbox" name="lists" value={l.id} defaultChecked={l.to_contact > 0} />
              <span>{l.name}</span><span className="text-xs text-muted">{l.channel === 'email' ? 'Email' : 'LinkedIn'} · {l.to_contact} to contact</span>
            </label>
          ))}
        </fieldset>
        <label className="flex items-center gap-2">Batch size <input name="n" type="number" min={1} max={100} defaultValue={30} className="input w-20" /></label>
        <button className="btn-primary">Start</button>
      </form>
    </div>
  );

  const now = new Date();
  const cfg = getSettings(db);
  const { items, deferred } = buildQueue(db, ids, now, cfg);
  const listById = new Map(ids.map(id => [id, getList(db, id)!]));
  const batch: SessionItem[] = items.slice(0, n).map(c => {
    const composed = composeFor(c, listById.get(c.list_id)!)!;
    return {
      id: c.id, name: c.name, role: c.role, org: c.org, list_name: c.list_name, channel: c.channel,
      email: c.email, email_confidence: c.email_confidence, linkedin_url: c.linkedin_url,
      next_deadline: c.next_deadline, mutual: c.mutual, priority: c.priority,
      subject: composed.subject, body: composed.body, canSaveMessage: composed.canSaveMessage,
    };
  });
  const stats = activityStats(db, now, cfg);
  return (
    <Session
      key={ids.join(',')}
      items={batch} total={items.length} deferred={deferred}
      orgsToday={Object.fromEntries(orgsSentToday(db, now, cfg))} companyMax={cfg.company_daily_max}
      invites={{ used: stats.invitesWeek, cap: stats.cap }}
    />
  );
}
```


- [ ] **Step 2: Client session** in `app/session/Session.tsx`

```tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { actContact, undoContact } from '@/app/actions';
import { Composer } from '@/app/contacts/Composer';
import { norm, type EmailConfidence } from '@/lib/parse';

export type SessionItem = {
  id: number; name: string; role: string | null; org: string | null; list_name: string; channel: 'email' | 'linkedin';
  email: string | null; email_confidence: EmailConfidence | null; linkedin_url: string | null;
  next_deadline: string | null; mutual: string | null; priority: number;
  subject: string; body: string; canSaveMessage: boolean;
};
type Props = {
  items: SessionItem[]; total: number; deferred: number;
  orgsToday: Record<string, number>; companyMax: number; invites: { used: number; cap: number };
};
type Done = Record<number, 'sent' | 'skipped'>;

export function Session({ items, total, deferred, orgsToday, companyMax, invites }: Props) {
  const router = useRouter();
  const [i, setI] = useState(0);
  const [done, setDone] = useState<Done>({});
  const [orgCount, setOrgCount] = useState<Record<string, number>>(orgsToday);
  const [used, setUsed] = useState(invites.used);
  const [history, setHistory] = useState<number[]>([]);
  const [limitHit, setLimitHit] = useState(false);
  const [msg, setMsg] = useState('');
  const [pending, start] = useTransition();
  const startedAt = useRef(Date.now());
  const item = items[i];

  const orgFull = (it: SessionItem, oc: Record<string, number>) => !!it.org && (oc[norm(it.org)] ?? 0) >= companyMax;
  const nextIndex = (from: number, d: Done, oc: Record<string, number>) => {
    for (let j = from + 1; j < items.length; j++) if (!d[items[j].id] && !orgFull(items[j], oc)) return j;
    return items.length;
  };

  const act = (kind: 'sent' | 'skip', override = false) => {
    if (!item || done[item.id]) return;
    start(async () => {
      setMsg('');
      const r = await actContact(item.id, kind, undefined, override);
      if (!r.ok) {
        if ('limit' in r) { setLimitHit(true); setUsed(r.limit.used); } else setMsg(r.error);
        return;
      }
      setLimitHit(false);
      const d: Done = { ...done, [item.id]: kind === 'sent' ? 'sent' : 'skipped' };
      let oc = orgCount;
      if (kind === 'sent') {
        if (item.org) oc = { ...oc, [norm(item.org)]: (oc[norm(item.org)] ?? 0) + 1 };
        if (item.channel === 'linkedin') setUsed(u => u + 1);
      }
      setDone(d); setOrgCount(oc); setHistory(h => [...h, item.id]); setI(nextIndex(i, d, oc));
    });
  };

  const undo = () => {
    const last = history[history.length - 1];
    if (last === undefined) { setMsg('Nothing to undo in this session.'); return; }
    start(async () => {
      if (!(await undoContact(last))) { setMsg('Nothing to undo.'); return; }
      const it = items.find(x => x.id === last)!;
      if (done[last] === 'sent') {
        if (it.org) setOrgCount(oc => ({ ...oc, [norm(it.org!)]: Math.max(0, (oc[norm(it.org!)] ?? 1) - 1) }));
        if (it.channel === 'linkedin') setUsed(u => Math.max(0, u - 1));
      }
      const d = { ...done }; delete d[last];
      setDone(d); setHistory(h => h.slice(0, -1)); setI(items.findIndex(x => x.id === last)); setLimitHit(false);
    });
  };

  const click = (cmd: string) => (document.querySelector(`[data-cmd="${cmd}"]`) as HTMLElement | null)?.click();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable;
      if (e.key === 'Escape') { e.preventDefault(); if (typing) t.blur(); else router.push('/today'); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey || pending) return;
      const k = e.key.toLowerCase();
      if (k === 'c') click('copy');
      else if (k === 'o') click('open');
      else if (k === 's') act('sent');
      else if (k === 'k') act('skip');
      else if (k === 'e') (document.querySelector('[data-cmd="edit"]') as HTMLElement | null)?.focus();
      else if (k === 'u') undo();
      else if (e.key === 'ArrowRight') setI(n => Math.min(n + 1, items.length));
      else if (e.key === 'ArrowLeft') setI(n => Math.max(n - 1, 0));
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const acted = Object.keys(done).length;
  const sent = Object.values(done).filter(v => v === 'sent').length;
  const remaining = items.filter(x => !done[x.id]).length;
  const perItem = acted ? (Date.now() - startedAt.current) / acted : 0;
  const eta = acted && remaining ? Math.max(1, Math.round((perItem * remaining) / 60000)) : null;
  const hasLinkedIn = items.some(x => x.channel === 'linkedin');
  const pct = used / invites.cap;

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 p-6">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted">
        <span className="text-[13px] font-medium text-fg">{Math.min(i + 1, items.length)} / {items.length}</span>
        <span>{sent} sent · {acted - sent} skipped</span>
        {eta && <span>~{eta} min left</span>}
        {hasLinkedIn && <span className={pct >= 1 ? 'text-bad' : pct >= 0.8 ? 'text-warn' : ''}>Invites this week {used}/{invites.cap}</span>}
        {(deferred > 0 || total > items.length) && <span>{total - items.length > 0 ? `${total - items.length} more after this batch` : ''}{deferred ? ` · ${deferred} held for company spacing` : ''}</span>}
        <Link href="/today" className="ml-auto hover:text-fg">Exit (Esc)</Link>
      </header>

      {!item ? (
        <div className="card space-y-3 p-6 text-center">
          <h1 className="page-title">Batch done</h1>
          <p className="text-muted">{sent} sent, {acted - sent} skipped.</p>
          <div className="flex justify-center gap-2">
            <Link href="/today" className="btn">Back to Today</Link>
            <button className="btn-primary" onClick={() => router.refresh()}>Next batch</button>
          </div>
        </div>
      ) : (
        <article className="card space-y-4 p-5">
          <header className="space-y-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <h1 className="text-base font-semibold tracking-tight">{item.name}</h1>
              {done[item.id] && <span className="text-xs text-good">{done[item.id] === 'sent' ? 'Sent' : 'Skipped'}</span>}
            </div>
            <p className="text-muted">{[item.role, item.org].filter(Boolean).join(' · ')}</p>
            <p className="flex flex-wrap gap-x-3 text-xs text-muted">
              <span>{item.list_name}</span>
              <span>Priority {['', 'low', 'medium', 'high'][item.priority]}</span>
              {item.next_deadline && <span className="text-warn">Deadline {item.next_deadline}</span>}
              {item.mutual && <span>Mutual: {item.mutual}</span>}
            </p>
          </header>

          {orgFull(item, orgCount) && !done[item.id] && (
            <p role="status" className="text-xs text-warn">You already contacted someone at {item.org} today. Skip for now (→) or send anyway (S).</p>
          )}

          <Composer
            key={item.id}
            id={item.id} channel={item.channel} to={item.email} confidence={item.email_confidence} linkedinUrl={item.linkedin_url}
            subject={item.subject} body={item.body} firstEmail={item.channel === 'email'} canSaveMessage={item.canSaveMessage}
          />

          <div className="flex flex-wrap items-center gap-1.5">
            <button className="btn-primary" disabled={pending || !!done[item.id]} onClick={() => act('sent')}>Mark sent <kbd className="opacity-70">S</kbd></button>
            <button className="btn" disabled={pending || !!done[item.id]} onClick={() => act('skip')}>Skip <kbd className="opacity-70">K</kbd></button>
            <button className="btn" disabled={pending} onClick={undo}>Undo <kbd className="opacity-70">U</kbd></button>
            <span className="ml-auto flex gap-1.5">
              <button className="btn" aria-label="Previous contact" disabled={i === 0} onClick={() => setI(n => Math.max(0, n - 1))}>←</button>
              <button className="btn" aria-label="Next contact" onClick={() => setI(n => Math.min(n + 1, items.length))}>→</button>
            </span>
          </div>

          {limitHit && (
            <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-warn/40 bg-warn/10 px-2 py-1.5 text-xs text-warn">
              You&apos;ve reached {used}/{invites.cap} LinkedIn invites this week. Sending more risks a restriction.
              <button className="btn" disabled={pending} onClick={() => act('sent', true)}>Send anyway</button>
            </div>
          )}
          {msg && <p role="alert" className="text-xs text-bad">{msg}</p>}
        </article>
      )}

      <footer className="mt-auto text-center text-xs text-muted">
        <kbd>C</kbd> copy · <kbd>O</kbd> open · <kbd>S</kbd> sent · <kbd>K</kbd> skip · <kbd>E</kbd> edit · <kbd>U</kbd> undo · <kbd>←</kbd>/<kbd>→</kbd> move · <kbd>Esc</kbd> exit
      </footer>
    </div>
  );
}
```

`lib/parse.ts` has no Node or DB imports, so importing `norm` in a client component is safe.

- [ ] **Step 3: Verify**

Run `npx tsc --noEmit`, `npm test` and `npm run build`. Then run the dev server and check:
- `curl` `/session` returns 200 and the HTML contains "Start a session".
- `curl` `/session?lists=1&n=5` returns 200 and the HTML contains "/ 5" or "Batch done".

Stop the server.

- [ ] **Step 4: Commit**

```bash
git add app/session
git commit -m "feat: keyboard session mode with company spacing, weekly cap and undo"
```

---

### Task 8: Ponytail cleanup and task list

**Files:**
- Modify: whatever ponytail findings touch; `docs/TASKS.md`

- [ ] **Step 1:** Invoke `ponytail:ponytail-review` on `git diff <M2 base>..HEAD -- . ':!docs' ':!package-lock.json'`. Apply only behaviour-preserving deletions or simplifications that do not remove validation, limits, error handling, accessibility attributes or tests. Record each finding as applied or rejected, with a reason.
- [ ] **Step 2:** Update `docs/TASKS.md`:
  - Tick the M2 items.
  - Remove these resolved lines from "Known follow-ups from M1 reviews": the bulk follow-up line, the check-in line, the `DEFAULT_SETTINGS` line, and the server-actions/undo-feedback line.
- [ ] **Step 3:** Run `npx tsc --noEmit`, `npm test` and `npm run build`, then commit with `chore: M2 ponytail cleanup and task list`.
