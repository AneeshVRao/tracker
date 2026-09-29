import { describe, expect, test } from 'vitest';
import { addDays, allowedActions, applyAction, DEFAULT_SETTINGS as cfg, nextDeadline, outcomesFor, todayIn, type State } from './rules';

const today = '2026-09-29';
const now = '2026-09-29T06:00:00.000Z';
const ctx = { today, now };
const fresh: State = { status: 'to_contact', outcome: null, followup_step: 0, follow_up_on: null, sent_at: null };
const after = (s: State, patch: Partial<State>): State => ({ ...s, ...patch });

describe('dates', () => {
  test('todayIn respects timezone', () => expect(todayIn('Asia/Kolkata', new Date('2026-09-29T20:00:00Z'))).toBe('2026-09-30'));
  test('addDays crosses months', () => expect(addDays('2026-09-29', 7)).toBe('2026-10-06'));
  test('nextDeadline: manual wins, else earliest upcoming', () => {
    expect(nextDeadline(['2026-04-03', '2026-11-30'], null, today)).toBe('2026-11-30');
    expect(nextDeadline(['2026-04-03'], null, today)).toBeNull();
    expect(nextDeadline(['2026-11-30'], '2026-10-15', today)).toBe('2026-10-15');
  });
});

describe('email sequence', () => {
  test('sent → nudge at +7, step 1', () => {
    const r = applyAction(fresh, 'email', 'sent', ctx, cfg);
    expect(r).toEqual({ event: 'sent', patch: { status: 'sent', sent_at: now, followup_step: 1, follow_up_on: '2026-10-06' } });
  });
  test('nudged twice then only close/replied remain', () => {
    let s = after(fresh, applyAction(fresh, 'email', 'sent', ctx, cfg).patch);
    s = after(s, applyAction(s, 'email', 'nudged', { ...ctx, today: '2026-10-06' }, cfg).patch);
    expect(s).toMatchObject({ followup_step: 2, follow_up_on: '2026-10-13' });
    s = after(s, applyAction(s, 'email', 'nudged', { ...ctx, today: '2026-10-13' }, cfg).patch);
    expect(s).toMatchObject({ followup_step: 3, follow_up_on: '2026-10-20' });
    expect(allowedActions(s, 'email')).toEqual(['replied', 'close']);
    expect(applyAction(s, 'email', 'close', { ...ctx, outcome: 'no_reply' }, cfg)).toEqual({ event: 'closed', patch: { status: 'closed', outcome: 'no_reply', follow_up_on: null } });
  });
  test('accepted is linkedin-only', () => {
    const s = after(fresh, applyAction(fresh, 'email', 'sent', ctx, cfg).patch);
    expect(() => applyAction(s, 'email', 'accepted', ctx, cfg)).toThrow(/not allowed/);
  });
});

describe('linkedin sequence', () => {
  test('sent → withdraw check at +21', () =>
    expect(applyAction(fresh, 'linkedin', 'sent', ctx, cfg).patch).toEqual({ status: 'sent', sent_at: now, followup_step: 1, follow_up_on: '2026-10-20' }));
  test('accepted → due today → messaged → conversation +7', () => {
    let s = after(fresh, applyAction(fresh, 'linkedin', 'sent', ctx, cfg).patch);
    s = after(s, applyAction(s, 'linkedin', 'accepted', ctx, cfg).patch);
    expect(s).toMatchObject({ status: 'accepted', follow_up_on: today });
    s = after(s, applyAction(s, 'linkedin', 'messaged', ctx, cfg).patch);
    expect(s).toMatchObject({ status: 'conversation', follow_up_on: '2026-10-06' });
  });
  test('withdrawn only while pending', () => {
    const sent = after(fresh, applyAction(fresh, 'linkedin', 'sent', ctx, cfg).patch);
    expect(outcomesFor(sent, 'linkedin')).toContain('withdrawn');
    expect(outcomesFor(after(sent, { status: 'accepted' }), 'linkedin')).not.toContain('withdrawn');
    expect(outcomesFor(sent, 'linkedin')).not.toContain('bounced');
  });
});

describe('guards', () => {
  test('to_contact offers sent/skip only', () => expect(allowedActions(fresh, 'email')).toEqual(['sent', 'skip']));
  test('close needs a valid outcome', () => {
    const s = after(fresh, applyAction(fresh, 'email', 'sent', ctx, cfg).patch);
    expect(() => applyAction(s, 'email', 'close', ctx, cfg)).toThrow(/outcome/);
    expect(() => applyAction(s, 'email', 'close', { ...ctx, outcome: 'withdrawn' }, cfg)).toThrow(/outcome/);
  });
  test('reopen clears sequence', () => {
    const skipped = after(fresh, applyAction(fresh, 'email', 'skip', ctx, cfg).patch);
    expect(applyAction(skipped, 'email', 'reopen', ctx, cfg).patch).toEqual({ status: 'to_contact', outcome: null, followup_step: 0, follow_up_on: null });
  });
  test('reference rows have no actions', () => expect(allowedActions({ ...fresh, status: 'reference' }, 'email')).toEqual([]));
});
