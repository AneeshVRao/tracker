# M5 Pre-send Checklist and Availability Dates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** First emails to professors state your exact availability window, and can't be copied until you've confirmed a short pre-send checklist.

**Architecture:** Two settings, `avail_from` and `avail_to`, are added next to the identity fields. A pure `formatRange` helper in `lib/template.ts` turns them into `{{my_dates}}`. A new `meFrom(settings)` helper replaces the three hand-built `me` objects. The checklist is client state in `Composer`, shown for first emails only, with a Session key to tick it.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, `node:sqlite`, vitest. No new dependencies.

**Spec:** `docs/specs/2026-09-29-outreach-tracker-design.md`. These ideas come from reviewing a comparable tool: exact dates in the subject line, and a pre-send checklist.

## Global Constraints

- The app never sends anything; copy + open stays the only path.
- Do not change existing `aria-*`, `role`, `name` or `key` attributes, except where a step says to.
- Do not touch `data/tracker.db` or `D:/Downloads`. Use fictional names in tests.
- Next 16 has breaking changes; read `AGENTS.md`.

---

### Task 1: `{{my_dates}}` from Settings

**Files:**
- Modify: `lib/rules.ts` (`Settings`, `DEFAULT_SETTINGS`)
- Modify: `lib/template.ts` (`TemplateContext.me`, `render`, `DEFAULT_TEMPLATES`, new `formatRange`, new `meFrom`)
- Modify: `lib/queries.ts` (`saveSettings`)
- Modify: `app/settings/SettingsForm.tsx`, `app/contacts/ContactPanel.tsx`, `app/session/page.tsx`, `app/intros/page.tsx`, `app/lists/[id]/page.tsx` (placeholder help)
- Test: `lib/template.test.ts`, `lib/queries.test.ts`

**Interfaces:**
- Produces:
  - `Settings.avail_from: string` and `Settings.avail_to: string`, each `''` or `YYYY-MM-DD`.
  - `formatRange(from: string, to: string): string` returns, for example, `'Dec 1, 2026 – Jan 15, 2027'`, with an en dash and spaces. It returns `''` if either value is empty.
  - `TemplateContext.me` gains `dates: string`.
  - `meFrom(s: Settings): { name: string; first_name: string; intro: string; dates: string }`.

- [ ] **Step 1: Failing tests.** Add to `lib/template.test.ts`:

```ts
test('formatRange formats an availability window in UTC', () => {
  expect(formatRange('2026-12-01', '2027-01-15')).toBe('Dec 1, 2026 – Jan 15, 2027');
  expect(formatRange('', '2027-01-15')).toBe('');
});
test('{{my_dates}} renders from me.dates and blocks when blank', () => {
  const me = { name: 'Alex Student', first_name: 'Alex', intro: 'a student', dates: 'Dec 1, 2026 – Jan 15, 2027' };
  expect(render('Window: {{my_dates}}', { ...ctx, me }).text).toBe('Window: Dec 1, 2026 – Jan 15, 2027');
  expect(render('{{my_dates}}', { ...ctx, me: { ...me, dates: '' } }).text).toBe('[[missing: my_dates]]');
});
test('default email subject carries the window', () => {
  expect(DEFAULT_TEMPLATES.email.subject).toContain('{{my_dates}}');
  expect(DEFAULT_TEMPLATES.email.body).not.toContain('your target window');
});
test('meFrom builds me from settings', () => {
  expect(meFrom({ ...DEFAULT_SETTINGS, my_name: 'Alex Student', avail_from: '2026-12-01', avail_to: '2027-01-15' }).dates).toBe('Dec 1, 2026 – Jan 15, 2027');
});
```

Add these imports where missing: `formatRange` and `meFrom` from `./template`, and `DEFAULT_SETTINGS` from `./rules`. Any existing test that builds `me` without `dates` must add `dates: 'Dec 1, 2026 – Jan 15, 2027'`.

In `lib/queries.test.ts` `describe('saveSettings')`, add `avail_from: '2026-12-01'` and `avail_to: '2027-01-15'` to `valid`, then add:

```ts
  test('availability round-trips and may be cleared', () => {
    const db = seed();
    saveSettings(db, valid);
    expect(getSettings(db)).toMatchObject({ avail_from: '2026-12-01', avail_to: '2027-01-15' });
    saveSettings(db, { ...valid, avail_from: '', avail_to: '' });
    expect(getSettings(db)).toMatchObject({ avail_from: '', avail_to: '' });
  });
  test.each([[{ avail_from: '2027-02-01' }], [{ avail_to: '' }], [{ avail_from: '12/01/2026' }]])('rejects bad availability %j', bad => {
    const db = seed(); expect(() => saveSettings(db, { ...valid, ...bad })).toThrow();
  });
```

- [ ] **Step 2:** Run `npx vitest run lib/template.test.ts lib/queries.test.ts`. The new tests should FAIL.

- [ ] **Step 3: Implement.**
  - **`lib/rules.ts`:** add `avail_from: string;` and `avail_to: string;` to `Settings`, and `avail_from: ''` and `avail_to: ''` to `DEFAULT_SETTINGS`.
  - **`lib/template.ts`:**

```ts
const RANGE_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
export function formatRange(from: string, to: string): string {
  return from && to ? `${RANGE_FMT.format(new Date(from))} – ${RANGE_FMT.format(new Date(to))}` : '';
}
export const meFrom = (s: Settings) => ({ name: s.my_name, first_name: s.my_first_name, intro: s.my_intro, dates: formatRange(s.avail_from, s.avail_to) });
```

  Import `type Settings` from `./rules`. Add `dates: string` to `TemplateContext.me`, and `my_dates: c.me?.dates ?? null` to the `render` vars map. Then update the defaults:
  - The email `subject` becomes `'Research internship inquiry ({{my_dates}}): {{my_name}}'`.
  - In the email `body`, replace `([[edit: your target window]])` with `({{my_dates}})`.

  - **`lib/queries.ts` `saveSettings`:** after the identity block, add:

```ts
  const [af, at] = [input.avail_from, input.avail_to].map(v => (v ?? '').trim());
  if ((af || at) && !(ISO_DATE.test(af) && ISO_DATE.test(at) && af <= at)) throw new Error('Availability needs both dates (YYYY-MM-DD), start on or before end');
```

  Then add `avail_from: af, avail_to: at,` to `values`. `ISO_DATE` already exists in the file.

  - **Callers:** in `ContactPanel.tsx` and `app/session/page.tsx`, replace the hand-built `{ name: …, first_name: …, intro: … }` passed to `composeFor` with `meFrom(settings)` (or `meFrom(cfg)`). In `app/intros/page.tsx`, build `me` with `meFrom(...)` as well. `IntroCard`'s prop type may keep only the fields it reads.
  - **`SettingsForm.tsx`:** after the send-window row, add an "Available for internship" row with two `<input type="date">`, `name="avail_from"` and `name="avail_to"`. Use `defaultValue={state?.values?.avail_from ?? s.avail_from}` (likewise for `avail_to`), with `aria-label`s "Available from" and "Available until", and the hint "Used in templates as {{my_dates}}, e.g. Dec 1, 2026 – Jan 15, 2027. Leave both empty to clear." Check that `saveSettingsAction` passes these fields and returns them in `values` on error.
  - **`app/lists/[id]/page.tsx`:** add `{{my_dates}}` to the placeholder help text.

- [ ] **Step 4:** Run `npm test` and `npx tsc --noEmit`. Expect everything to pass.
- [ ] **Step 5:** Run `npm run build`. Then run a GET smoke check of `/settings`, `/contacts?open=1` and `/intros` against a server on a free port, and kill it afterwards.
- [ ] **Step 6:** Commit with `git commit -m "feat: availability window in settings as {{my_dates}}"`, using `git add` on the files above only.

---

### Task 2: Pre-send checklist gate on first emails

**Files:**
- Modify: `lib/template.ts` (new `PRESEND_CHECKS`)
- Modify: `app/contacts/Composer.tsx`, `app/session/Session.tsx`
- Test: `lib/template.test.ts`

**Interfaces:**
- Consumes: `Composer` props as they are now (`firstEmail`, `channel`).
- Produces:
  - `PRESEND_CHECKS: readonly string[]`.
  - A `data-cmd="checks"` button in `Composer`, which Session's `X` key clicks.

- [ ] **Step 1: Failing test.** Add to `lib/template.test.ts`:

```ts
test('pre-send checklist covers the four things professors look for', () => {
  expect(PRESEND_CHECKS).toEqual([
    'Cites a specific paper or project of theirs',
    'Links one piece of my own work',
    'States my exact dates',
    'CV attached in Gmail (links cannot attach it)',
  ]);
});
```

- [ ] **Step 2:** Run `npx vitest run lib/template.test.ts`. It should FAIL because `PRESEND_CHECKS` is not exported.

- [ ] **Step 3: Implement.**
  - **`lib/template.ts`:** export the array above as `export const PRESEND_CHECKS = [ … ] as const;`.
  - **`Composer.tsx`:**
    - Add `const gated = p.channel === 'email' && p.firstEmail;` and `const [checked, setChecked] = useState<boolean[]>(() => PRESEND_CHECKS.map(() => false));`.
    - Then add `const unchecked = gated && checked.includes(false);`, and OR `unchecked` into `blocked`.
    - When `gated`, render this block just above the button row:

```tsx
{gated && (
  <fieldset className="space-y-1 text-xs">
    <legend className="label">Before you send</legend>
    {PRESEND_CHECKS.map((label, i) => (
      <label key={label} className="flex items-center gap-2">
        <input type="checkbox" checked={checked[i]} onChange={e => setChecked(c => c.map((v, j) => (j === i ? e.target.checked : v)))} />
        {label}
      </label>
    ))}
    <button type="button" data-cmd="checks" className="btn" onClick={() => setChecked(c => c.map(() => !c.every(Boolean)))}>
      {checked.every(Boolean) ? 'Untick all' : 'Tick all'}
    </button>
  </fieldset>
)}
```

    - Alongside the existing `[[…]]` warning, add `{unchecked && <p className="text-xs text-warn">Tick the checklist to copy.</p>}`.
    - Remove the now-redundant `{p.firstEmail && <p className="text-xs text-muted">Attach your CV.</p>}` line, since the checklist covers it.
    - `Composer` is keyed per contact by its callers, so the state resets per contact. Confirm that `ContactPanel` passes a per-contact `key`, and add `key={c.id}` if it doesn't.
  - **`Session.tsx`:** in the key handler, add `else if (k === 'x') click('checks');` after the `'o'` branch. In the bottom hint bar, add `<kbd className="kbd">X</kbd> checklist ·` after `open ·`.

- [ ] **Step 4:** Run `npm test`, `npx tsc --noEmit` and `npm run build`. Expect everything to pass.
- [ ] **Step 5:** Commit with `git commit -m "feat: pre-send checklist gates copy on first emails"`, using `git add` on the files above only.

---

### Task 3: Docs

- [ ] Add an "M5" section to `docs/TASKS.md` with both items ticked. In `README.md`, mention under first-run step 2 that "available from/until" fills `{{my_dates}}`, and under Session that `X` ticks the checklist.
- [ ] Commit with `git commit -m "docs: M5 checklist and availability"`.
