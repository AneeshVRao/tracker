# Outreach Tracker — PRD & Design Spec

Date: 2026-09-29 · Owner: Aneesh · Status: draft for review

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
- Non-contact tabs (Summary, Read me first, Institutions, Audit log, Checked and excluded, Note Templates) are skipped by default; Formal Programmes is reference only.

## 5. Concepts

- **List** — one imported tab (e.g. "Professors"). Has a channel (`email` | `linkedin`), a saved column mapping, a message template set, and a header signature so a re-import of the same tab is recognised.
- **Contact** — one person in one list. Core fields are normalised; every original column is kept verbatim in `extra`.
- **Event** — anything that happened to a contact (sent, accepted, replied, nudged, status change, note). Stats and history are built from events.
- **Person key** — normalised LinkedIn URL, else lowercase email, else `name|org`. Same key in two lists = the same human.

## 6. Data model (SQLite via `node:sqlite`)

```sql
CREATE TABLE lists (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email','linkedin')),
  source_file TEXT NOT NULL,
  source_sheet TEXT NOT NULL,
  header_sig TEXT NOT NULL,            -- sha1 of normalised header row
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
  message TEXT,                        -- note / angle from sheet, user-editable
  priority INTEGER NOT NULL DEFAULT 2, -- 1..3
  degree TEXT, mutual TEXT,
  project_tag TEXT,                    -- detected project mentioned in message
  deadline_text TEXT, deadline_on TEXT,-- ISO date, earliest upcoming
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
  type TEXT NOT NULL,                  -- see §8
  at TEXT NOT NULL,
  data TEXT                            -- JSON
);
CREATE INDEX events_type_at ON events(type, at);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
```

Settings defaults: `weekly_invite_cap=100`, `company_daily_max=1`, `email_nudge_days=[7,14]`, `linkedin_withdraw_days=21`, `after_accept_followup_days=7`, `projects=["ContextCraft","Uktam","RiskMesh","ShabdSetu"]`, `my_timezone=Asia/Kolkata`, `send_window={days:[2,3,4],from:9,to:11}`.

## 7. Import pipeline

1. **Upload** an `.xlsx` (drag-drop). The server reads every tab with `exceljs`, returns tab names, row counts, headers. Tabs whose names match `read me|summary|audit|excluded|template|institution` are unticked by default.
2. **Recognise**: if a tab's `header_sig` matches an existing list, preselect "Update list X" with its saved mapping.
3. **Map**: for new tabs, auto-guess each core field from header synonyms (case-insensitive substring):
   - name ← `full name|name`; org ← `company|institute|university|current company`; role ← `title|position|current title`; country ← `country`
   - email ← `email` (not `email status`); linkedin_url ← `linkedin` + `url|profile`
   - message ← `connection note|connection request note|email angle|note`; priority ← `fit rating|priority`
   - degree ← `degree|mutual`; deadline ← `deadline`; status ← `status` (prefers `outreach status`); sent date ← `date sent`
   - channel guess: `email` if the email column is ≥50% filled with addresses, else `linkedin`.
   The user confirms with dropdowns (each shows 3 sample values). Optional **exclude rule**: "rows where column C contains text T start as Skipped" (default for Professors: Ranking Basis contains `FAILS CUTOFF`).
4. **Normalise** per row (pure functions, unit-tested):
   - `parseEmail(cell)` → `{email, confidence}`: first RFC-ish address via regex; `VERIFIED`→verified, `INFERRED`→inferred, else unknown; no address → null.
   - `normLinkedIn(url)` → `https://www.linkedin.com/in/<slug>` lowercased, no query/trailing slash.
   - `parsePriority(text)` → first word: strong/high→3, moderate/medium→2, weak/low→1; `N/A` or missing → 2.
   - `parseDegree(text)` → `{degree:'2nd'|'3rd+'|null, mutual:string|null}`; 2nd-degree adds +1 priority (cap 3) for sorting only.
   - `parseDeadline(text, today)` → all dates in formats `Mon D, YYYY`, `D Month YYYY`, `Month Dth, YYYY`, `YYYY-MM-DD`; earliest ≥ today, else null.
   - `mapStatus(text)` → `not started|not sent|''`→to_contact; `dropped`→skipped; `sent`→sent; `replied`→replied; unknown → to_contact (original kept in extra).
   - `detectProject(message, projects)` → first project name found (case-insensitive), else null.
5. **Upsert** by `(list_id, person_key)`:
   - New row → insert, one `imported` event.
   - Existing row → refresh core fields that the user has not edited (`message`, `deadline_*` only if unchanged since import) and `extra`; **never** touch `status`, `my_notes`, `follow_up_on`, events.
   - Rows in the list but absent from the new file are left alone and counted in the import report.
6. **Report**: inserted / updated / unchanged / skipped-by-rule / rows with no name / duplicates-in-other-lists.

## 8. Status machine

| From | Action (key) | To | Side effects |
|---|---|---|---|
| to_contact | Mark sent (S) | sent | `sent_at=now`; email: `follow_up_on=+7d, step=1`; linkedin: `follow_up_on=+21d` (withdraw check); event `sent` |
| to_contact | Skip (K) | skipped | event `skipped` |
| sent (linkedin) | Accepted (A) | accepted | `follow_up_on=today` (send after-accept message); event `accepted` |
| accepted | Message sent (M) | conversation | `follow_up_on=+7d`; event `messaged` |
| sent (email) | Nudged (N) | sent | step 1→2: `follow_up_on=+7d` (day 14); step 2→: `follow_up_on=+7d` then "close as no reply" suggested |
| sent (linkedin), due | Withdrawn (W) | closed | outcome `withdrawn` |
| sent / accepted / conversation | Replied (R) | replied | `follow_up_on=null`; event `replied` |
| replied | In conversation | conversation | — |
| any open | Close (with outcome) | closed | outcome positive / declined / no_reply / bounced |
| closed / skipped | Reopen | to_contact | event `reopened` |

"Open" = to_contact, sent, accepted, replied, conversation. Any status change writes an event; `last_touch_at` updates. Undo: the last action on a contact can be undone within the session (reverts fields from the event's `data.prev`).

## 9. Features & acceptance criteria

**F1 Import & mapping** — §7. AC: importing all three workbooks produces 250 + 466 + 234 + 50 contacts; re-importing the same file changes 0 statuses and inserts 0 rows.

**F2 Today** (home) — sections in order: *Deadlines ≤ 21 days* (count + earliest), *Follow-ups due* (grouped: email nudges, LinkedIn accepted → message, invites to withdraw), *Replies awaiting you* (status replied), *Suggested next batch* (top 10 from the queue, per list). Each row has one-click actions. Top strip: invites this week `n / cap`, sent today, replies this week.

**F3 Contacts table** — filter by list, status, channel, priority, email confidence, has-deadline, any `extra` column (column picker + value); full-text search on name/org/role/message; sortable; bulk select → mark skipped / set follow-up date / export. Row click opens the contact panel. Paginated at 100.

**F4 Contact panel** (side sheet) — header (name, role, org, country, list, priority, status chip, "also in: <list> (<status>)" badge when the person key appears elsewhere); message block with composer (F6); action buttons for valid transitions (§8); follow-up date picker; my notes (autosave); original columns (collapsible key/value, long text wrapped); event timeline.

**F5 Session mode** — full-screen, one contact at a time from a queue built from chosen lists + channel. Queue order: open deadline ≤ 21d first, then priority (with 2nd-degree boost), then source row. Keys: `C` copy message, `O` open LinkedIn / Gmail compose, `S` mark sent + next, `K` skip + next, `E` edit message, `U` undo last, `→`/`←` next/prev without action, `Esc` exit. Shows running count and ETA. Respects F7 limits (blocks with an override button). AC: a keyboard-only user can complete copy→open→sent for a contact in three keystrokes.

**F6 Composer** — per-list templates with `{{placeholders}}`: `{{first_name}}`, `{{name}}`, `{{org}}`, `{{role}}`, `{{message}}`, and `{{col:<Exact Column Name>}}` for any original column (so a new workbook's columns are usable without code). Professors default body uses Most Relevant Paper, Specific Overlap With My Work, Specific Email Angle. Email opens Gmail compose (`https://mail.google.com/mail/?view=cm&to=&su=&body=`), falling back to `mailto:` if the body exceeds 1800 chars. Warnings shown inline: `INFERRED email — verify before sending`, `unknown/no email`, `Attach CV` chip on first email. LinkedIn: live char counter on the note, red above 300, copy disabled until ≤300 (override allowed). Templates editable in list settings; missing placeholder values render as `[[missing: X]]` and block copy until edited.

**F7 LinkedIn safety** — rolling-7-day invite count from `sent` events on linkedin lists vs `weekly_invite_cap`; warn at 80%, block at 100% (override logs `limit_override`). Company spacing: a contact whose `org` already had a `sent` event today (any list) is pushed out of today's queue and flagged in the panel. Pending invites older than `linkedin_withdraw_days` appear in Today → "withdraw".

**F8 Follow-up sequence** — §8 timings, driven by settings. Follow-up templates `followup1`, `followup2`, `after_accept` render in the composer when the contact is due. "Close all stale" bulk action on Today for email step-2 contacts overdue by ≥7 days.

**F9 Deadline radar** — `deadline_on` from parse; editable in panel. Today shows countdown chips; table filter "deadline within N days". Formal Programmes tab is imported as a read-only reference list (name, host, deadline text, url) shown on the radar.

**F10 Best time to send** — static country→IANA timezone map for countries in data (India / USA → first). For email contacts, panel shows the professor's local time now and "next good slot" (next Tue–Thu 09:00–11:00 local) converted to `my_timezone`, with a "good time now" badge when inside the window. Suggestion text reminds to use Gmail's Schedule send. Unknown country → hidden.

**F11 Warm intro paths** — page listing each `mutual` with count of contacts, their orgs and statuses; action "Copy intro request" renders an intro template naming the people; logs `intro_requested` on each.

**F12 What-gets-replies** — for contacts with a `sent` event: sent, accepted %, replied %, median days to reply; grouped by one dimension picked from: list, project_tag, priority, degree, country, or any `extra` column. Groups with n < 5 are shown greyed with "small sample".

**F13 Duplicates** — "also in" badge (F4); marking sent on one copy shows a warning on the others; import report lists cross-list duplicates.

**F14 Export** — download `.xlsx`: one tab per list, original columns + Status, Outcome, Sent At, Follow Up On, My Notes, Last Touch.

## 10. Screens

Sidebar: Today · Contacts · Session · Intros · Stats · Lists (import, mapping, templates) · Settings. Visual direction: dense, calm, keyboard-first work tool (think Linear/Superhuman), light + dark, status colours used sparingly. Frontend polish via the `impeccable` / `taste-skill` skills during implementation.

## 11. Architecture

- Next.js (App Router, TypeScript), server components for reads, server actions for mutations. Runs with `npm run dev` / `npm start` bound to `127.0.0.1`.
- `lib/db.ts` — opens `data/tracker.db` with `node:sqlite`, runs `schema.sql` once, WAL mode.
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

## 14. Open decisions (defaults chosen, change anytime in Settings)

Invite cap 100/week · company spacing 1/day · email nudges day 7 & 14 · LinkedIn withdraw at day 21 · send window Tue–Thu 09–11 local.
