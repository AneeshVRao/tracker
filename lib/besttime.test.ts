import { describe, expect, test } from 'vitest';
import { formatIn, inWindow, localParts, nextSlot, tzFor } from './besttime';

const w = { days: [2, 3, 4], from: 9, to: 11 };

describe('tzFor', () => {
  test.each([
    ['India', null, 'Asia/Kolkata'], ['India / USA', null, 'Asia/Kolkata'], ['USA', null, 'America/New_York'],
    ['United Kingdom', null, 'Europe/London'], ['Hong Kong', null, 'Asia/Hong_Kong'], ['UK', 'Europe/Paris', 'Europe/Paris'],
    ['Thailand', null, 'Asia/Bangkok'], ['Atlantis', null, null], [null, null, null],
  ] as const)('%s / %s → %s', (c, o, tz) => expect(tzFor(c, o)).toBe(tz));
});

describe('local time', () => {
  test('localParts in a +05:30 zone', () =>
    expect(localParts(new Date('2026-09-29T06:00:00Z'), 'Asia/Kolkata')).toEqual({ day: 2, hour: 11, minute: 30 }));
  test('inWindow uses recipient-local time', () => {
    expect(inWindow(new Date('2026-09-29T09:30:00Z'), 'Europe/London', w)).toBe(true);   // Tue 10:30 BST
    expect(inWindow(new Date('2026-09-29T10:30:00Z'), 'Europe/London', w)).toBe(false);  // Tue 11:30 BST
    expect(inWindow(new Date('2026-10-02T09:00:00Z'), 'Europe/London', w)).toBe(false);  // Fri
  });
  test('formatIn', () => expect(formatIn(new Date('2026-09-30T03:30:00Z'), 'Asia/Kolkata')).toBe('Wed 30 Sept, 09:00'));
});

describe('nextSlot', () => {
  test('inside the window → now', () => {
    const now = new Date('2026-09-29T09:30:00Z');
    expect(nextSlot(now, 'Europe/London', w)).toEqual(now);
  });
  test('after the window → next allowed day at from:00 local (half-hour zone)', () =>
    expect(nextSlot(new Date('2026-09-29T06:00:00Z'), 'Asia/Kolkata', w).toISOString()).toBe('2026-09-30T03:30:00.000Z'));
  test('before the window the same day', () =>
    expect(nextSlot(new Date('2026-09-29T06:00:00Z'), 'America/New_York', w).toISOString()).toBe('2026-09-29T13:00:00.000Z'));
  test('Friday → next Tuesday', () =>
    expect(nextSlot(new Date('2026-10-02T12:00:00Z'), 'Europe/London', w).toISOString()).toBe('2026-10-06T08:00:00.000Z'));
});
