# Outreach Tracker

A local tracker for cold outreach by email and LinkedIn. Import your contact lists from Excel
workbooks, then work through them: set status, schedule follow-ups, compose messages from
templates, undo mistakes, see what gets replies, and export back to Excel.

Everything runs on your machine. Data is stored in a local SQLite file and nothing is sent to
any external service.

## Requirements

- Node.js 22.5 or newer (the app uses the built-in `node:sqlite` module)

## Setup

```bash
npm install
npm run dev     # http://127.0.0.1:3000
npm test        # vitest
npm run build   # production build
npm start       # serve the production build
```

Data lives in `data/tracker.db` (gitignored). Delete the file to start over.

## First run

1. Open **Import**, choose a workbook, check the column mapping the wizard proposes, and confirm.
   Re-importing the same workbook does not create duplicates.
2. Open **Settings** and fill in your name, first name and a short intro. Templates use these
   as `{{my_name}}`, `{{my_first_name}}` and `{{my_intro}}`. You can also set your preferred
   send window and the LinkedIn weekly cap here.
3. Open **Today** to see what needs attention.

## Pages

- **Today**: deadlines, follow-ups due, replies waiting, and the next batch to send.
- **Session**: a keyboard-driven queue for working through a batch quickly.
- **Contacts**: the full table with filters, a detail panel, the message composer, notes and undo.
- **Deadlines**: upcoming application deadlines, including a reference list of formal programmes.
- **Intros**: warm introduction paths between contacts.
- **Stats**: which messages, angles and send times get replies.
- **Lists**: one page per imported list, with export to Excel.
- **Import**: the workbook import wizard.
- **Settings**: your identity, send window, limits and templates.

## Documentation

- Design spec: [docs/specs/2026-09-29-outreach-tracker-design.md](docs/specs/2026-09-29-outreach-tracker-design.md)
- Implementation plans: [docs/plans](docs/plans)
- Task list: [docs/TASKS.md](docs/TASKS.md)
