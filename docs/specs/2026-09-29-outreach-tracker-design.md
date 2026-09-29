# Outreach Tracker — PRD & Design Spec

Date: 2026-09-29 · Owner: Aneesh · Status: reviewed (rev 2 — review fixes applied)

## 1. Problem

Outreach targets live in separate, heavily researched Excel workbooks (250 professors, 466 remote-HR contacts, 284 NITW alumni), each with its own columns, its own status vocabulary and a ready-written note or email angle per person. Nothing tracks what was actually sent, what is due for follow-up, which deadlines are close, or whether LinkedIn invite volume is safe. More workbooks will arrive.

## 2. Goal

A local web app that turns any contact workbook into one working queue, and makes sending each message a few keystrokes while protecting the LinkedIn account and never letting a follow-up or deadline slip.

**Success looks like:** 30 LinkedIn requests in about 10 minutes in session mode; zero missed follow-ups; a new workbook imported and usable in under 2 minutes without code changes.

## 3. Non-goals (v1)

- Sending from the app (no Gmail API, no LinkedIn automation). The user always presses send.
- Login, multi-user, cloud sync, mobile layout beyond "doesn't break".
- AI-written messages — the sheets already hold per-person notes and angles.
- Reply detection by reading the inbox. Replies are logged by hand.

## 4. Source data (observed)

| Workbook / tab | Rows | Channel | Message column | Priority column | Status column |
|---|---|---|---|---|---|
| research_internship_tracker / Professors | 250 | email | Specific Email Angle (+ Most Relevant Paper, Specific Overlap) | Fit Rating (Strong/Moderate/Weak + variants) | Status: Not Started / Dropped |
| Remote_HR_Contacts / Contacts | 466 | linkedin | LinkedIn Connection Request Note | — (Degree/Mutuals gives 2nd-degree boost) | Outreach Status: Not started |
| NITW_Alumni / Alumni Pipeline | 234 | linkedin | Connection Note (<=300 chars) | Priority: High/Medium/Low | Outreach Status: Not sent, Date Sent |
| NITW_Alumni / Verified - not working | 50 | linkedin | Connection Note | — | — |

Quirks the importer must handle:
- Email cell mixes address and provenance: `jdoe@cs.example.edu (VERIFIED - listed on the faculty page)`, some `INFERRED`, some unparseable (`at) iis [g`).
- Application Deadline is free text: `SRFP: Nov 30, 2026`, `30 November 2026`, `Extended till 5.30 PM, September 29th, 2026`, `N/A - cold email route`.
- Degree cell: `2nd - mutual: Priya Example`, `2nd`, `3rd+`.
- Some professor rows are pre-flagged `FAILS CUTOFF` (Ranking Basis) or `Dropped`.
- Non-contact tabs (Summary, Read me first, Institutions, Audit log, Checked and excluded, Note Templates) are skipped by default; Formal Programmes imports as a **reference** list (§5), not contacts.
- Header traps (verified against the real sheets): `Paper Read Status` precedes `Status`; `Visa/Logistics Note` precedes `Specific Email Angle`; `Company Hiring Signal` / `Company Type` sit next to `Company`; `Email Status`, `LinkedIn Status`, `Your Notes` exist. "Verified - not working" has a `Status` column that means employment, not outreach.
- 0 duplicate LinkedIn URLs / emails within any sheet; 0 people shared across lists today.

## 5. Concepts

- **List** — one imported tab (e.g. "Professors"). Kind `contacts` (has a channel `email` | `linkedin`, mapping, templates) or `reference` (rows shown read-only on the deadline radar, e.g. Formal Programmes; no statuses). A re-import is recognised by **source file name + sheet name**; the header signature is only a hint used when the file was renamed.
- **Contact** — one person in one list. Core fields are normalised; every original column is kept verbatim in `extra`.
- **Event** — anything that happened to a contact (sent, accepted, replied, nudged, status change, note). Stats and history are built from events.
- **Person key** — normalised LinkedIn URL, else lowercase email, else `name|org`. Same key in two lists = the same human.

## 6. Data model (SQLite via `node:sqlite`)

```sql
CREATE TABLE lists (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'contacts' CHECK (kind IN ('contacts','reference')),
  channel TEXT CHECK (channel IN ('email','linkedin')), -- NULL for reference lists
  source_file TEXT NOT NULL,           -- base file name
  source_sheet TEXT NOT NULL,
  header_sig TEXT NOT NULL,            -- sha1 of normalised header row (rename hint only)
  mapping TEXT NOT NULL,               -- JSON: core field -> source column, + exclude rule
  templates TEXT NOT NULL DEFAULT '{}',-- JSON: subject, body, followup1, followup2, after_accept
  imported_at TEXT NOT NULL
);
CREATE TABLE contacts (
  id INTEGER PRIMARY KEY,
  list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  person_key TEXT NOT NULL,
  source_row INTEGER NOT NULL,
  name TEXT NOT NULL, org TEXT, role TEXT, country TEXT,
  email TEXT, email_confidence TEXT CHECK (email_confidence IN ('verified','inferred','unknown')),
  linkedin_url TEXT,
  message TEXT,                        -- current message, user-editable
  message_src TEXT,                    -- value as last imported (edit detection)
  priority INTEGER NOT NULL DEFAULT 2, -- 1..3
  degree TEXT, mutual TEXT,
  project_tag TEXT,                    -- detected project mentioned in message
  tz TEXT,                             -- IANA override; NULL = from country
  deadline_text TEXT,                  -- raw cell as last imported
  deadline_dates TEXT NOT NULL DEFAULT '[]', -- JSON ISO dates parsed from text (all of them)
  deadline_manual TEXT,                -- ISO date set by user; wins over parsed
  status TEXT NOT NULL DEFAULT 'to_contact',
  outcome TEXT,                        -- positive|declined|no_reply|bounced|withdrawn
  followup_step INTEGER NOT NULL DEFAULT 0,
  follow_up_on TEXT,
  sent_at TEXT, last_touch_at TEXT,
  my_notes TEXT,
  extra TEXT NOT NULL,                 -- JSON of every original column
  UNIQUE (list_id, person_key)
);
CREATE INDEX contacts_person ON contacts(person_key);
CREATE INDEX contacts_due ON contacts(follow_up_on);
CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                  -- see §8 event types
  at TEXT NOT NULL,
  data TEXT,                           -- JSON; status actions store {prev:{...fields}}
  reverted INTEGER NOT NULL DEFAULT 0  -- 1 after undo; excluded from stats/limits
);
CREATE INDEX events_type_at ON events(type, at);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
```

"Next deadline" is computed on read: `deadline_manual` if set, else the earliest date in `deadline_dates` ≥ today. All "today" / date arithmetic uses `my_timezone`. Reference-list rows are stored as contacts with `status='reference'`, `person_key='ref:'||source_row`, and are excluded from every queue, count and stat.

Settings defaults: `weekly_invite_cap=100`, `company_daily_max=1`, `email_nudge_days=[7,7]` (days after send, then after nudge 1), `linkedin_withdraw_days=21`, `after_accept_followup_days=7`, `projects=["ContextCraft","Uktam","RiskMesh","ShabdSetu"]`, `my_timezone=Asia/Kolkata`, `send_window={days:[2,3,4],from:9,to:11}`.

## 7. Import pipeline

1. **Upload** an `.xlsx` (drag-drop). The server reads every tab with `exceljs`, returns tab names, row counts, headers. Tabs whose names match `read me|summary|audit|excluded|template|institution` are unticked by default; tabs matching `programme|program` default to **reference** kind (mapping: name, deadline text, url; everything else in `extra`).
2. **Recognise**: if `(source_file, source_sheet)` matches an existing list, preselect "Update list X" with its saved mapping. Else if `header_sig` matches, offer "Looks like list X (file renamed?)". A saved mapping whose columns are missing from the new headers is shown as unmapped for the user to fix — never silently dropped.
3. **Map**: for new tabs, auto-guess each core field. Per field, candidates are tried in this precedence: (a) exact header match to a synonym, (b) synonyms in listed order as whole-word matches, first column wins within a synonym. A header containing any **negative term** for that field is never chosen.

   | Field | Synonyms (in order) | Negative terms |
   |---|---|---|
   | name | `full name`, `name` | `company`, `file` |
   | org | `current company`, `company`, `institute/university`, `institute`, `university` | `signal`, `type` |
   | role | `current title`, `title`, `position/seniority`, `position` | |
   | country | `country` | |
   | email | `email (verified vs inferred)`, `email` | `status` |
   | linkedin_url | `linkedin profile url`, `linkedin url`, `linkedin` | `status`, `headline`, `note` |
   | message | `connection note`, `linkedin connection request note`, `specific email angle`, `email angle` | `visa`, `your notes`, `notes` |
   | priority | `fit rating`, `priority` | `basis` |
   | degree | `degree / mutuals`, `degree` | |
   | deadline | `application deadline`, `deadline` | |
   | status | `outreach status`, `status` | `paper`, `read`, `email`, `linkedin`, `what the headline` |
   | sent_date | `date sent` | |

   Channel guess: `email` if ≥50% of the mapped email column contains an address, else `linkedin`. The mapping UI shows 3 sample values per field so a wrong guess (e.g. the employment `Status` on "Verified - not working") is visible and can be set to "none". A unit test locks the expected mapping for all 4 real contact tabs.
   The user confirms with dropdowns (each shows 3 sample values). Optional **exclude rule**: "rows where column C contains text T start as Skipped" (default for Professors: Ranking Basis contains `FAILS CUTOFF`).
4. **Normalise** per row (pure functions, unit-tested):
   - `parseEmail(cell)` → `{email, confidence}`: first RFC-ish address via regex; `VERIFIED`→verified, `INFERRED`→inferred, else unknown; no address → null.
   - `normLinkedIn(url)` → `https://www.linkedin.com/in/<slug>` lowercased, no query/trailing slash.
   - `parsePriority(text)` → first word: strong/high→3, moderate/medium→2, weak/low→1; `N/A`, `Unassessed` or missing → 2.
   - `parseDegree(text)` → `{degree:'2nd'|'3rd+'|null, mutual:string|null}`; 2nd-degree adds +1 priority (cap 3) for sorting only.
   - `parseDeadlines(text)` → **every** date found, as sorted ISO strings. Formats (month = full or 3-letter, day may carry `st|nd|rd|th`, comma optional): `Mon D YYYY`, `Mon D, YYYY`, `D Mon YYYY`, `YYYY-MM-DD`, and `D Mon` / `Mon D` without a year when a year appears later in the same cell. Ranges (`Feb 02-22, 2026`, `16 Mar - 3 Apr 2026`) yield the **end** date. Past dates are kept (they are harmless — "next deadline" filters on read). Tests: ~15 representative real values with exact expected output, plus a real-data sweep asserting every cell containing a day+month+year yields at least one date. False positives are accepted; the panel makes the chosen date one-click editable.
   - `mapStatus(text)` → `not started|not sent|''`→to_contact; `dropped`→skipped; `sent`→sent; `replied`→replied; unknown → to_contact (original kept in extra). When the result is `sent`, `sent_at` = mapped Date Sent (else import time) and a `sent` event is written at that date so limits and stats count it; follow-up dates are derived as if marked sent then.
   - `detectProject(message, projects)` → first project name found (case-insensitive), else null.
5. **Upsert** within the list, matching by `person_key`, falling back to `name|org` (so fixing an INFERRED email in the workbook updates the row instead of duplicating it):
   - New row → insert, one `imported` event.
   - Existing row → refresh `extra`, `source_row`, and core fields. `message` is replaced only if `message == message_src` (user hasn't edited); `message_src` is always updated. `deadline_text`/`deadline_dates` always refresh (the user's override lives in `deadline_manual`). **Never** touch `status`, `outcome`, `my_notes`, `follow_up_on`, `tz`, events.
   - Rows in the list but absent from the new file are left alone and counted in the import report.
6. **Report**: inserted / updated / unchanged / skipped-by-rule / rows with no name / duplicates-in-other-lists.

## 8. Status machine

| From | Action (key) | To | Side effects |
|---|---|---|---|
| to_contact | Mark sent (S) | sent | `sent_at=now`; email: `follow_up_on=+7d, step=1`; linkedin: `follow_up_on=+21d` (withdraw check); event `sent` |
| to_contact | Skip (K) | skipped | event `skipped` |
| sent (linkedin) | Accepted (A) | accepted | `follow_up_on=today` (send after-accept message); event `accepted` |
| accepted | Message sent (M) | conversation | `follow_up_on=+7d`; event `messaged` |
| sent (email), step 1 | Nudged (N) | sent | `step=2`, `follow_up_on=+7d`, template `followup1` was shown; event `nudged` |
| sent (email), step 2 | Nudged (N) | sent | `step=3`, `follow_up_on=+7d`, template `followup2`; event `nudged` |
| sent (email), step 3, due | Close as no reply (X) | closed | outcome `no_reply`; event `closed` |
| sent (linkedin), due | Withdrawn (W) | closed | outcome `withdrawn`; event `closed` |
| sent / accepted / conversation | Replied (R) | replied | `follow_up_on=null`; event `replied` |
| replied | In conversation (V) | conversation | `follow_up_on=+7d` (check-in reminder, no template — free text); event `status` |
| conversation, due | Checked in (M) | conversation | `follow_up_on=+7d`; event `messaged` |
| any open | Close with outcome (X) | closed | outcome positive / declined / no_reply / bounced; event `closed` |
| closed / skipped | Reopen | to_contact | clears outcome, step, follow_up_on; event `reopened` |

`followup_step`: 0 = not sent; 1 = sent, first nudge due at day 7; 2 = nudged once, second nudge due at day 14; 3 = nudged twice, due at day 21 for "close as no reply". "Close all stale" (F8) closes every email contact at step 3 whose `follow_up_on` has passed.

**Event types (complete list):** `imported`, `sent`, `skipped`, `accepted`, `messaged`, `nudged`, `replied`, `status`, `closed`, `reopened`, `note`, `edited` (message/deadline/tz), `limit_override`, `intro_requested`.

"Open" = to_contact, sent, accepted, replied, conversation. Every action writes one event with `data.prev` = the contact fields it changed; `last_touch_at` updates. **Undo** (U, or the toast button): the contact's most recent non-reverted action event is marked `reverted=1` and its `data.prev` restored. Reverted events are ignored by limits, stats and timelines. One level per contact, no time limit.

## 9. Features & acceptance criteria

**F1 Import & mapping** — §7. AC: importing all three workbooks with default ticks produces 4 contact lists (250 + 466 + 234 + 50 = 1000 contacts; 11 Professors rows start Skipped: 3 `Dropped` ∪ 9 `FAILS CUTOFF` by exclude rule, 1 overlapping) and 1 reference list (Formal Programmes, 30 rows); auto-mapping picks `Status` (not `Paper Read Status`) and `Specific Email Angle` (not `Visa/Logistics Note`); re-importing the same files changes 0 statuses and inserts 0 rows; re-importing after editing a message in-app keeps the edit.

**F2 Today** (home) — sections in order: *Deadlines ≤ 21 days* (count + earliest), *Follow-ups due* (grouped: email nudges, LinkedIn accepted → message, invites to withdraw), *Replies awaiting you* (status replied), *Suggested next batch* (top 10 from the queue, per list). Each row has one-click actions. Top strip: invites this week `n / cap`, sent today, replies this week.

**F3 Contacts table** — filter by list, status, channel, priority, email confidence, has-deadline, any `extra` column (column picker + value); full-text search on name/org/role/message; sortable; bulk select → mark skipped / set follow-up date (export is whole-workbook via F14). Row click opens the contact panel. Paginated at 100.

**F4 Contact panel** (side sheet) — header (name, role, org, country, list, priority, status chip, "also in: <list> (<status>)" badge when the person key appears elsewhere); message block with composer (F6); action buttons for valid transitions (§8); follow-up date picker; my notes (autosave); original columns (collapsible key/value, long text wrapped); event timeline.

**F5 Session mode** — full-screen, one contact at a time from a queue built from chosen lists + channel. Queue order: open deadline ≤ 21d first, then priority (with 2nd-degree boost), then source row. Keys: `C` copy message, `O` open LinkedIn / Gmail compose, `S` mark sent + next, `K` skip + next, `E` edit message, `U` undo last, `→`/`←` next/prev without action, `Esc` exit. Shows running count and ETA. Respects F7 limits (blocks with an override button). AC: a keyboard-only user can complete copy→open→sent for a contact in three keystrokes.

**F6 Composer** — per-list templates with `{{placeholders}}`: `{{first_name}}`, `{{name}}`, `{{org}}`, `{{role}}`, `{{message}}`, and `{{col:<Exact Column Name>}}` for any original column (so a new workbook's columns are usable without code). Professors default body uses Most Relevant Paper, Specific Overlap With My Work, Specific Email Angle. Email opens Gmail compose (`https://mail.google.com/mail/?view=cm&to=&su=&body=`). If the URL-encoded body exceeds 1800 chars, it opens compose with `to` + `su` only and copies the body to the clipboard, with a toast saying "body copied — paste it". Warnings shown inline: `INFERRED email — verify before sending`, `unknown/no email`, `Attach CV` chip on first email. LinkedIn: live char counter on the note, red above 300, copy disabled until ≤300 (override allowed). Templates editable in list settings; missing placeholder values render as `[[missing: X]]` and block copy until edited.

**F7 LinkedIn safety** — rolling-7-day invite count from `sent` events on linkedin lists vs `weekly_invite_cap`; warn at 80%, block at 100% (override logs `limit_override`). Company spacing (both channels — two professors in one department get the same treatment): a contact whose normalised `org` already has `company_daily_max` non-reverted `sent` events today (`my_timezone`, any list) is pushed out of today's queue and flagged in the panel. Pending invites older than `linkedin_withdraw_days` appear in Today → "withdraw".

**F8 Follow-up sequence** — §8 timings, driven by settings. Follow-up templates `followup1`, `followup2`, `after_accept` render in the composer when the contact is due. "Close all stale" bulk action on Today for email step-2 contacts overdue by ≥7 days.

**F9 Deadline radar** — next deadline computed on read (§6); the panel lists every parsed date and lets the user pick/type one into `deadline_manual`. Today shows countdown chips; table filter "deadline within N days". Formal Programmes tab is imported as a read-only reference list (name, host, deadline text, url) shown on the radar.

**F10 Best time to send** — static country→IANA timezone map for countries in data (multi-country cells like `India / USA` → first; USA → America/New_York, Canada → America/Toronto, Australia → Australia/Sydney as defaults), overridable per contact via `tz` in the panel. Conversions use `Intl.DateTimeFormat(...).formatToParts` — no tz library. For email contacts, panel shows the professor's local time now and "next good slot" (next Tue–Thu 09:00–11:00 local) converted to `my_timezone`, with a "good time now" badge when inside the window. Suggestion text reminds to use Gmail's Schedule send. Unknown country → hidden.

**F11 Warm intro paths** — page listing each `mutual` with count of contacts, their orgs and statuses; action "Copy intro request" renders an intro template naming the people; logs `intro_requested` on each.

**F12 What-gets-replies** — for contacts with a non-reverted `sent` event: sent, accepted % (LinkedIn lists only; shown as "—" for email), replied % (a `replied` event, either channel), median days from `sent` to `replied`; grouped by one dimension picked from: list, project_tag, priority, degree, country, or any `extra` column. Groups with n < 5 are shown greyed with "small sample".

**F13 Duplicates** — "also in" badge (F4); marking sent on one copy shows a warning on the others; import report lists cross-list duplicates.

**F14 Export** — download `.xlsx`: one tab per list, original columns + Status, Outcome, Sent At, Follow Up On, My Notes, Last Touch.

## 10. Screens

Sidebar: Today · Contacts · Session · Intros · Stats · Lists (import, mapping, templates) · Settings. Visual direction: dense, calm, keyboard-first work tool (think Linear/Superhuman), light + dark, status colours used sparingly. Frontend polish via the `impeccable` / `taste-skill` skills during implementation.

## 11. Architecture

- Next.js (App Router, TypeScript), server components for reads, server actions for mutations. Runs with `npm run dev` / `npm start` bound to `127.0.0.1`.
- `lib/db.ts` — `import 'server-only'`; opens `data/tracker.db` with `node:sqlite` as a singleton cached on `globalThis` (survives dev hot-reload), runs `schema.sql` once, WAL mode, `foreign_keys=ON`. **Risk, de-risked first (M1 task 1):** a spike confirming Next leaves `node:sqlite` external (add to `serverExternalPackages` if needed), that pages using it render in dev and `next build`, and whether Node 24.15 prints an ExperimentalWarning (acceptable). Fallback if the spike fails: `better-sqlite3` with the same `lib/db.ts` interface.
- `lib/parse.ts` — pure normalisers (§7.4). `lib/rules.ts` — status machine, follow-up dates, limits, queue order, best-time. `lib/importer.ts` — workbook → rows → upsert. `lib/template.ts` — placeholder rendering. `lib/stats.ts` — SQL aggregations.
- `exceljs` for reading and export. No other runtime deps beyond Next/React.
- `data/` and `*.xlsx` are gitignored (personal contact data).

## 12. Error handling

- Import is one transaction per tab; any failure rolls back that tab and reports the row number.
- Rows with no name are skipped and reported, not fatal.
- Unparseable email/deadline → null + original kept in `extra`; nothing guessed silently.
- DB file locked/corrupt → error page naming the path; the app never deletes `data/`.
- All server actions validate ids/status transitions against §8 and reject illegal ones.

## 13. Testing

- Unit (vitest): every function in `parse.ts`, `rules.ts`, `template.ts` against real cell values quoted in §4.
- Integration: import the three real workbooks into a temp DB → assert counts (F1 AC), re-import idempotency, status mapping.
- Manual: session-mode keyboard run of 10 contacts; export round-trip opens in Excel.

## 14. Delivery milestones

All features stay in v1; they ship in three milestones, each usable on its own and each with its own implementation plan.

| Milestone | Scope | Usable outcome |
|---|---|---|
| **M1 Core loop** | node:sqlite spike · schema · import + mapping + reference lists (F1) · contacts table (F3) · contact panel (F4) · status machine + undo (§8) · composer + 300-char counter (F6) · export (F14) | All 1000 contacts in one place; copy → open → mark sent works; nothing lost vs Excel |
| **M2 Daily driver** | Today (F2) · session mode (F5) · follow-up sequence (F8) · LinkedIn safety (F7) | Daily outreach runs from the keyboard, safely, with no missed follow-ups |
| **M3 Intelligence** | Deadline radar (F9) · best time (F10) · warm intros (F11) · stats (F12) · duplicates (F13) | Prioritisation and learning what works |

Deadline parsing (`parseDeadlines`) and `deadline_*` columns land in M1 (import needs them); the radar UI is M3.

## 15. Defaults (change anytime in Settings)

Invite cap 100/week · company spacing 1/day, both channels · email nudges at day 7 and 14, close as no reply at day 21 · LinkedIn withdraw at day 21 · send window Tue–Thu 09–11 recipient-local · all "today" math in Asia/Kolkata.
