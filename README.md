# Outreach Tracker

Local-first tracker for cold outreach (email and LinkedIn): import contact lists from Excel workbooks,
work through them with status actions, follow-up dates, message composer and undo, then export back to Excel.
Next.js 16 + `node:sqlite`, no external services.

```bash
npm install
npm run dev     # http://127.0.0.1:3000
npm test        # vitest
npm run build   # production build
```

Data lives in `data/tracker.db` (SQLite, gitignored). Delete it to start over.

- Specs: [docs/specs](docs/specs)
- Plans: [docs/plans](docs/plans)
- Task list: [docs/TASKS.md](docs/TASKS.md)
