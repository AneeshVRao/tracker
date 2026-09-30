# M4 Finish & Publish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the open follow-ups in `docs/TASKS.md`, remove real third-party personal data from tests and docs, make the app usable by anyone by moving identity into settings, give the newer pages a consistent design, and leave a clean repo that can go to a **public** GitHub repository.

**Architecture:** Mostly small changes to existing modules. Identity (`my_name`, `my_first_name`, `my_intro`) and the send window move into `Settings`. Templates reference identity through new placeholders. Edit server actions return results instead of throwing.

**Tech Stack:** Node 24.15, Next.js 16.3.7, React 19, Tailwind v4, `node:sqlite`, vitest 5. No new dependencies.

**Spec:** `docs/specs/2026-09-29-outreach-tracker-design.md` (rev 2). This plan finishes the follow-ups recorded in `docs/TASKS.md`.

## Global Constraints

- The repository will be **public**:
  - No real person's name, email, LinkedIn slug or phone number may appear in any tracked file.
  - Use obviously fictional data such as `Jane Doe`, `Priya Example` and `jdoe@cs.example.edu`.
  - Institutions, companies and programme names are fine.
  - The app owner's identity must not be hard-coded in code or defaults. It lives in Settings.
- `data/` and `*.xlsx` stay gitignored. Never modify, stage or print `data/tracker.db`.
- No new dependencies. Local only, bound to `127.0.0.1`.
- Pure modules (`rules`, `template`, `parse`, `mapping`, `besttime`) stay client-safe.
- UI uses the existing tokens and classes. Every control needs an accessible name, and messages need `role="alert"` or `role="status"`.
- Next.js 16 behaves differently from older versions. Read `node_modules/next/dist/docs/` before using APIs.

---

### Task 1: Scrub third-party personal data from tests and docs

**Files:** `lib/parse.test.ts`, `lib/template.test.ts`, `lib/insights.test.ts`, `lib/queries.test.ts`, `docs/specs/2026-09-29-outreach-tracker-design.md`, `docs/plans/*.md`

- [ ] **Step 1:** Replace every real third-party name, email and LinkedIn slug listed in the controller's private scrub list, which is delivered with the task brief and not stored in the repo, with the fictional replacements it gives. Keep every test's logic identical; only the literal strings change.

- [ ] **Step 2:** Run the grep from the private scrub list; it must print nothing. Then run `npm test` (it must stay green) and `npx tsc --noEmit`.

- [ ] **Step 3:** Commit with the message `chore: replace real names and emails in tests and docs with fictional data`.

---

### Task 2: Identity and send window in Settings

**Files:** `lib/rules.ts`, `lib/queries.ts` (`saveSettings`), `lib/template.ts` (`TemplateContext`, `render`, `DEFAULT_TEMPLATES`, `composeFor`), `app/contacts/ContactPanel.tsx`, `app/session/page.tsx`, `app/intros/IntroCard.tsx`, `app/intros/page.tsx`, `app/settings/SettingsForm.tsx`, `app/lists/[id]/page.tsx`. Tests go in `lib/template.test.ts`, `lib/queries.test.ts` and `lib/rules.test.ts`.

**Interfaces:**
- `Settings` gains `my_name: string`, `my_first_name: string` and `my_intro: string`. All three default to `''`.
- `TemplateContext` gains an optional `me?: { name: string; first_name: string; intro: string }`.
- `render` resolves `{{my_name}}`, `{{my_first_name}}` and `{{my_intro}}` from `ctx.me`. A missing or blank value becomes `[[missing: my_name]]` (and likewise for the others), which blocks copying.
- `composeFor(c, list, me?)` passes `me` through.
- `saveSettings` accepts `my_name`, `my_first_name`, `my_intro` (each trimmed, at most 200 characters, may be empty) plus `send_days`, `send_from` and `send_to`.
  - `send_days` arrives as the FormData field `send_days`, repeated or comma-joined, with weekday numbers 0–6. At least one day is required.
  - `send_from` and `send_to` are integers 0–23, with `from < to`.
  - These are stored as the `send_window` object.

- [ ] **Step 1: Failing tests.**

`lib/template.test.ts`:

```ts
test('identity placeholders come from ctx.me; missing ones block copy', () => {
  const me = { name: 'Alex Student', first_name: 'Alex', intro: 'a third-year ECE undergraduate at Example Institute' };
  expect(render("I'm {{my_name}}, {{my_intro}}. — {{my_first_name}}", { ...ctx, me }).text)
    .toBe("I'm Alex Student, a third-year ECE undergraduate at Example Institute. — Alex");
  const r = render('{{my_name}}', ctx);
  expect(r.text).toBe('[[missing: my_name]]');
  expect(hasBlockers(r.text)).toBe(true);
});
test('default templates contain no hard-coded identity', () => {
  const all = JSON.stringify(DEFAULT_TEMPLATES);
  expect(all).toContain('{{my_name}}');
  expect(all).not.toMatch(/Aneesh|Warangal|NIT /);
});
```

`lib/queries.test.ts`, inside `describe('saveSettings')`. Extend the `valid` object with `my_name: ' Alex Student '`, `my_first_name: 'Alex'`, `my_intro: 'a student'`, `send_days: '2,3,4'`, `send_from: '9'` and `send_to: '11'`, then add:

```ts
  test('identity and send window round-trip', () => {
    const db = seed();
    saveSettings(db, { ...valid, send_days: '1,5', send_from: '8', send_to: '10' });
    expect(getSettings(db)).toMatchObject({ my_name: 'Alex Student', my_first_name: 'Alex', my_intro: 'a student', send_window: { days: [1, 5], from: 8, to: 10 } });
  });
  test.each([['send_days', ''], ['send_days', '7'], ['send_from', '11'], ['send_to', '24'], ['my_name', 'x'.repeat(201)]])(
    'rejects %s=%s', (k, v) => { const db = seed(); expect(() => saveSettings(db, { ...valid, [k]: v })).toThrow(); });
```

The existing tests that reject bad values must also keep working with the extended `valid` object.

- [ ] **Step 2: Implement.**
  - **`DEFAULT_SETTINGS`:** add `my_name: ''`, `my_first_name: ''` and `my_intro: ''`.
  - **`DEFAULT_TEMPLATES`:** replace every hard-coded identity.
    - `SIGN_OFF` becomes `'Best regards,\n{{my_name}}'`.
    - The email body's first sentence becomes `I'm {{my_name}}, {{my_intro}}. I recently read your work "{{col:Most Relevant Paper(s)}}".`
    - The subject becomes `'Prospective research intern: {{my_name}}'`.
    - followup2's sign-off becomes `Thank you for your time,\n{{my_first_name}}`.
  - **`render`:** add `my_name`, `my_first_name` and `my_intro` to its variable map, taken from `c.me`. Keep the `Object.hasOwn` guards.
  - **Callers of `composeFor`:** ContactPanel and the session page pass `{ name: s.my_name, first_name: s.my_first_name, intro: s.my_intro }` built from settings.
  - **IntroCard:** receives `me` as a prop from `app/intros/page.tsx`, which gets it from `getSettings`. Build the default intro text from `me`:
    - Where a value is blank, insert `[[edit: your name]]` or `[[edit: one line about you]]` so the placeholder is obvious.
    - Block the copy while any `[[…]]` is present, using the existing `hasBlockers` from `@/lib/template`.
    - Remove the hard-coded "Aneesh", "NIT Warangal" and "ECE".
  - **Settings page:** add rows for "Your name", "Your first name" and "One line about you", described as used in templates as `{{my_intro}}`. Add a send-window row with seven labelled weekday checkboxes named `send_days` (values 0–6, checked from `s.send_window.days`) and two number inputs, `send_from` and `send_to`. `saveSettingsAction` must build the input with `fd.getAll('send_days').join(',')` for `send_days`, because checkboxes repeat the key. When the settings page loads and `s.my_name` is empty, show a notice at the top: "Set your name so message templates can sign off for you."
  - **`app/lists/[id]/page.tsx`:** in the placeholder help text, add `{{my_name}} {{my_first_name}} {{my_intro}}`.

- [ ] **Step 3:** Run `npm test`, `npx tsc --noEmit` and `npm run build`. Then run a GET smoke check: `/settings`, `/intros` and `/contacts?open=1` should each return 200. Commit with the message `feat: identity and send window in settings; templates use {{my_*}} placeholders`.

---

### Task 3: Edit actions return results instead of throwing

**Files:** `app/actions.ts`, `app/contacts/Fields.tsx`, `app/contacts/Composer.tsx`, `app/contacts/DeadlineEditor.tsx`, `app/contacts/TzOverride.tsx`

- [ ] **Step 1:** In `app/actions.ts`, make `editContact` and `saveNotes` return `Promise<{ ok: true } | { ok: false; error: string }>`. Wrap them in try/catch using the existing `message(e)` helper. `editContact` keeps calling `refresh()` in `finally`. `saveNotes` keeps not revalidating.
- [ ] **Step 2:** Update every caller to use the result instead of relying on try/catch. On `!r.ok`, show `r.error` in the component's existing error element, or add a `<span role="alert" className="text-xs text-bad">` where there isn't one.
  - `FollowUp` and `Notes` in `Fields.tsx`: add error display. For Notes, only update the `saved` ref when `r.ok`.
  - Composer's "Save note".
  - DeadlineEditor.
  - TzOverride.
- [ ] **Step 3:** Run `npx tsc --noEmit`, `npm test` and `npm run build`, then a GET smoke check of `/contacts?open=1`. Commit with the message `refactor: edit actions return results; inline error messages`.

---

### Task 4: Mapping and parsing robustness

**Files:** `lib/mapping.ts`, `lib/parse.ts`. Tests go in `lib/mapping.test.ts` and `lib/parse.test.ts`.

- [ ] **Step 1: Failing tests.** Append to `lib/mapping.test.ts` inside `describe('guessMapping on real headers')`. The real-header tests above must keep passing unchanged.

```ts
  test('exact matches follow synonym order', () => expect(guessMapping(['Name', 'Full Name', 'x']).name).toBe('Full Name'));
  test('negative terms match whole words only', () => {
    expect(guessMapping(['Profile Name', 'a', 'b']).name).toBe('Profile Name');
    expect(guessMapping(['Thread Status', 'a', 'b']).status).toBe('Thread Status');
  });
  test('an Email Angle column is not an email column', () => {
    const m = guessMapping(['Name', 'Specific Email Angle', 'x']);
    expect(m.email).toBeUndefined();
    expect(m.message).toBe('Specific Email Angle');
  });
```

Append to `lib/parse.test.ts`:

```ts
describe('parse robustness', () => {
  test('the word "may" is not a yearless month', () => expect(parseDeadlines('This may 3 be delayed; decision in 2027')).toEqual([]));
  test('full May dates still parse', () => expect(parseDeadlines('Closes May 15, 2027')).toEqual(['2027-05-15']));
  test('mutual stops at a line break', () => expect(parseDegree('2nd - mutual: Priya Example\nsee notes')).toEqual({ degree: '2nd', mutual: 'Priya Example' }));
});
```

- [ ] **Step 2: Implement.**

In `lib/mapping.ts` `guessMapping`:

```ts
    const ok = headers.filter(h => h.trim() && !neg.some(n => hasWord(lc(h), n)));
    const hit = syn.map(s => ok.find(h => lc(h) === s)).find(Boolean) ?? syn.map(w => ok.find(h => hasWord(lc(h), w))).find(Boolean);
```

Add `'angle'` to the `email` negatives. Run the real-header tests. If a real header now maps differently because negatives are whole-word, adjust only the negative list, never the expected mapping, and say so.

In `lib/parse.ts`:
- Add a `MON_NOT_MAY` pattern: the same alternation as `MON` but without `may`. Use it in the two yearless rules (the last two `DATE_RULES`).
- In `parseDegree`, use `s.match(/mutual:\s*([^\r\n]+)/i)`.

- [ ] **Step 3:** Run the focused tests, the full suite and `npx tsc --noEmit`. Commit with the message `fix: synonym-ordered exact matches, whole-word negatives, stricter yearless dates`.

---

### Task 5: Small UI finishes

**Files:** `app/session/Session.tsx`, `app/lists/[id]/page.tsx`

- [ ] In `Session.tsx`, freeze the "more after this batch" count at mount: `const [totalAtStart] = useState(total)`. Use it instead of `total`, so the count doesn't drift as you send.
- [ ] In `app/lists/[id]/page.tsx`, build the hidden template inputs from the fixed key list `['subject','body','followup1','followup2','after_accept'] as const` instead of `Object.keys(t)`. Missing keys are then still posted as `''`.
- [ ] Run `npx tsc --noEmit`, `npm run build` and `npm test`. Commit with the message `fix: stable session remaining count; fixed template key list`.

---

### Task 6: Design consistency pass on the newer pages

**Files:** presentation only in `app/today`, `app/session`, `app/deadlines`, `app/intros`, `app/stats`, `app/settings`, `app/globals.css`

- [ ] Invoke the `taste-skill` skill, which is the user's primary frontend skill, and follow its audit-first process. Brief: "A dense, calm, keyboard-first outreach tool (Linear/Superhuman feel). `/contacts`, `/import` and `/lists` already had a design pass. Bring Today, Session, Deadlines, Intros, Stats and Settings to the same standard: hierarchy, spacing, empty states, focus visibility, and light and dark contrast (WCAG AA). Session is the most-used screen; make the current card and the key hints very clear."
- [ ] Presentation only. Change class names, `globals.css` and presentational wrappers. Do not change logic, props, handlers, server actions, `aria-*` or `role` attributes, `key`s, form `name` or `value` attributes, or button order inside forms.
- [ ] Run `npx tsc --noEmit`, `npm test` and `npm run build`. Commit with the message `style: design pass for today, session, deadlines, intros, stats, settings`.

---

### Task 7: README, task list, whole-repo ponytail audit

- [ ] Rewrite `README.md` for a public audience in 40–70 lines:
  - what the app does (import outreach spreadsheets, then track, compose, follow up, and read stats);
  - screenshots are not needed;
  - requirements (Node ≥ 22.5 for `node:sqlite`);
  - setup commands: `npm install`, `npm run dev`, `npm test`;
  - where data lives (`data/tracker.db`, gitignored) and that nothing leaves your machine;
  - first-run steps: import a workbook, then fill in Settings → your name;
  - the page list;
  - links to the spec, plans and TASKS.
  - Include no personal details about the author.
- [ ] Update `docs/TASKS.md`:
  - Add an "M4 Finish" section with the items above ticked.
  - Delete the follow-up lines M4 resolves: header auto-mapping, deadline parsing, server actions throw, the session drift note, and the best-time window note.
  - Keep any genuinely remaining items, such as the panel tab order below 1280px and `next/font` at build time.
- [ ] Invoke the `ponytail:ponytail-audit` skill (a whole-repo audit) with the Skill tool. Apply only behaviour-preserving deletions and simplifications, and never remove validation, safety guards, accessibility attributes or tests. Record each finding as applied or rejected, with a reason.
- [ ] Run `npx tsc --noEmit`, `npm test` and `npm run build`. Commit with the message `docs: public README; chore: ponytail audit cleanup`.
