# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One person: the owner, a third-year ECE undergraduate running research-internship and job outreach. They work through it in focused sittings, on a laptop, alongside Gmail and LinkedIn in other tabs. Not built for other users; no onboarding for strangers.

## Product Purpose

A local, private outreach desk. Spreadsheets of professors and LinkedIn contacts are imported, then worked through in a keyboard queue. Every message is written personally and copied into Gmail or LinkedIn by hand; the app never sends anything. It tracks status, follow-ups, deadlines and what gets replies. Success: more careful, specific messages sent per sitting, nobody contacted twice, no follow-up or deadline missed.

## Positioning

Built around the owner's own research sheets (paper, angle, overlap, target window per professor), not a generic directory. Copy is gated until the message is genuinely personalised: unfilled `[[…]]` markers and a pre-send checklist block it.

## Operating Context

- Runs on localhost (`npm run dev`); data in `data/tracker.db`, never committed.
- Daily ritual: Today → Session (C copy, O open, X checklist, S sent, K skip, U undo, ←/→, Esc).
- Sources: Excel workbooks, re-importable without duplicates; reference lists (formal programmes, DRDO labs).
- LinkedIn weekly invite cap and per-company daily spacing are safety limits, not suggestions.

## Capabilities and Constraints

Pages: Today, Session, Contacts (table + panel + composer), Deadlines, Intros, Stats, Lists, Import, Settings. Next.js 16, React 19, Tailwind v4, `node:sqlite`. No new runtime dependencies without reason. The public GitHub copy must never contain third-party contact data.

## Brand Commitments

Name in the app chrome is "Outreach". The user named https://coderoggy78.github.io/winter-research-desk/ as visual inspiration for the redesign.

## Evidence on Hand

Real data: 250 professors, 99 IIT faculty, 750 LinkedIn contacts, 80 reference rows. No testimonials or metrics to show; none should be invented.

## Product Principles

1. Speed in a sitting beats features: every common action has a key.
2. Honesty gates: never let a generic or unfinished message be copied.
3. The owner sends; the tool only prepares and records.
4. Private by default: nothing leaves the machine.

## Accessibility & Inclusion

WCAG AA contrast in light and dark; visible focus; everything operable by keyboard.
