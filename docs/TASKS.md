# Outreach Tracker: Tasks

Spec: [specs/2026-09-29-outreach-tracker-design.md](specs/2026-09-29-outreach-tracker-design.md)

## M1 Core loop — [plan](plans/2026-09-29-m1-core-loop.md)

- [x] 1. Scaffold + `node:sqlite` spike + DB layer
- [x] 2. Cell normalisers (`lib/parse.ts`)
- [x] 3. Column auto-mapping (`lib/mapping.ts`)
- [x] 4. Status machine and dates (`lib/rules.ts`)
- [x] 5. Templates (`lib/template.ts`)
- [x] 6. Workbook reader + importer, incl. real-data acceptance test
- [x] 7. Queries, actions, undo, export
- [x] 8. App shell, server actions, import wizard
- [x] 9. Contacts table + contact panel + composer
- [x] 10. Lists, template editor, export download
- [x] 11. Design pass (taste-skill), acceptance run, ponytail review

**Done when:** all three workbooks import as 250 / 30 (reference) / 466 / 234 / 50 with 11 professors skipped; re-import changes nothing; copy → open → mark sent → undo works; export opens in Excel.

### Known follow-ups from M1 reviews (none block use)

- Header auto-mapping: exact-match pass ignores synonym order; negative terms match substrings; a sheet with "Email Angle" but no Email column maps email→angle (the wizard shows it, fix by hand).
- Deadline parsing: yearless/"may" false positives beyond the documented one; `parseDegree` misses multi-line cells.
- Session: header's 'more after this batch' count drifts as you send (cosmetic); ←/→-passed contacts aren't revisited automatically.
- Below 1280px the contact panel stacks above the table (tab order ≠ visual order); `next/font` fetches Geist at build time.

## M2 Daily driver — [plan](plans/2026-09-30-m2-daily-driver.md)

- [x] Today page (F2): deadlines, follow-ups due, replies waiting, next batch
- [x] Session mode (F5): keyboard queue `C O S K E U ← → Esc`
- [x] Follow-up sequence surfaced (F8): due lists, "close all stale"
- [x] LinkedIn safety (F7): weekly cap, company spacing, withdraw list
- [x] Settings page for §15 defaults

## M3 Intelligence — plan to be written after M2 ships

- [ ] Deadline radar (F9) incl. Formal Programmes reference list, manual deadline edit
- [ ] Best time to send (F10), per-contact timezone override
- [ ] Warm intro paths (F11)
- [ ] What-gets-replies stats (F12)
- [ ] Duplicate warnings across lists (F13) beyond the M1 badge
