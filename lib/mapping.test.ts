import { describe, expect, test } from 'vitest';
import { guessChannel, guessExclude, guessInclude, guessKind, guessMapping } from './mapping';

const PROFESSORS = ['Name', 'Institute/University', 'Country', 'Track', 'Department/Lab', 'Position/Seniority', 'Research Focus', 'Research Summary (~100w)', 'Most Relevant Paper(s)', 'Paper Read Status', 'Specific Overlap With My Work', 'Fit Rating', 'Confidence in Fit', 'Likely Intern Requirements (evidence-backed only)', 'Paid/Unpaid + Stipend', 'Remote/In-Person/Formal-Only', 'Formal Program', 'Application Deadline', 'My Target Window', 'Visa/Logistics Note', 'Email (verified vs inferred)', 'MOU with NIT Warangal', 'Specific Email Angle', 'Source / Last Verified', 'Status', 'Notes', 'Ranking Basis', 'Remote-Work Evidence', '2023+ Papers Scanned', 'Added By'];
const HR = ['Full Name', 'Title', 'Company', 'Company Hiring Signal', 'LinkedIn Profile URL', 'LinkedIn Status', 'Background Signal', 'Email', 'Email Status', 'LinkedIn Connection Request Note', 'Degree / Mutuals (as shown to Aneesh)', 'Outreach Status', 'Added', 'Live Re-check (23 Sep 2026)'];
const ALUMNI = ['#', 'Name', 'Graduation Year', 'Branch', 'Current Title', 'Current Company', 'Company Type', 'Priority', 'Relevance / Why Connect', 'LinkedIn URL', 'LinkedIn Status', 'Shared Ground', 'Connection Note (<=300 chars)', 'Chars', 'Year Evidence', 'Outreach Status', 'Date Sent', 'Your Notes', 'LinkedIn Headline (Sept 2026)'];
const NOT_WORKING = ['#', 'Name', 'Graduation Year', 'Branch', 'Status', 'What the headline shows', 'LinkedIn URL', 'Connection Note (<=300 chars)', 'LinkedIn Headline (Sept 2026)'];
const PROGRAMMES = ['programme', 'host', 'eligible_for_aneesh', 'window_fit', 'dates', 'stipend', 'deadline', 'url', 'checked', 'notes'];

describe('guessMapping on real headers', () => {
  test('Professors avoids Paper Read Status and Visa/Logistics Note', () => expect(guessMapping(PROFESSORS)).toEqual({
    name: 'Name', org: 'Institute/University', role: 'Position/Seniority', country: 'Country',
    email: 'Email (verified vs inferred)', message: 'Specific Email Angle', priority: 'Fit Rating',
    deadline: 'Application Deadline', status: 'Status',
  }));
  test('Remote HR avoids Company Hiring Signal, Email Status, LinkedIn Status', () => expect(guessMapping(HR)).toEqual({
    name: 'Full Name', org: 'Company', role: 'Title', email: 'Email', linkedin_url: 'LinkedIn Profile URL',
    message: 'LinkedIn Connection Request Note', degree: 'Degree / Mutuals (as shown to Aneesh)', status: 'Outreach Status',
  }));
  test('Alumni avoids Company Type and Your Notes', () => expect(guessMapping(ALUMNI)).toEqual({
    name: 'Name', org: 'Current Company', role: 'Current Title', linkedin_url: 'LinkedIn URL',
    message: 'Connection Note (<=300 chars)', priority: 'Priority', status: 'Outreach Status', sent_date: 'Date Sent',
  }));
  test('Verified - not working maps its (employment) Status — UI must show it', () => expect(guessMapping(NOT_WORKING)).toEqual({
    name: 'Name', linkedin_url: 'LinkedIn URL', message: 'Connection Note (<=300 chars)', status: 'Status',
  }));
  test('Formal Programmes', () => expect(guessMapping(PROGRAMMES)).toEqual({ name: 'programme', org: 'host', deadline: 'deadline' }));
});

describe('tab guesses', () => {
  test.each([['Summary', false], ['Read me first', false], ['Audit log', false], ['Checked and excluded', false], ['Note Templates', false], ['Institutions', false], ['Professors', true], ['Contacts', true]])(
    'include %s → %s', (name, expected) => expect(guessInclude(name as string, 10)).toBe(expected));
  test('empty tab excluded', () => expect(guessInclude('Contacts', 0)).toBe(false));
  test('programmes are reference', () => {
    expect(guessKind('Formal Programmes')).toBe('reference');
    expect(guessKind('Professors')).toBe('contacts');
  });
  test('channel', () => {
    const m = { email: 'Email' };
    expect(guessChannel([{ Email: 'a@b.co' }, { Email: 'c@d.co' }, { Email: 'Not found' }], m)).toBe('email');
    expect(guessChannel([{ Email: 'Not found' }, { Email: 'Not found' }, { Email: 'a@b.co' }], m)).toBe('linkedin');
    expect(guessChannel([{ Email: 'a@b.co' }], {})).toBe('linkedin');
  });
  test('exclude rule finds first column starting with a marker', () => {
    const rows = [{ Notes: '', 'Ranking Basis': 'NIRF #3' }, { Notes: 'FAILS CUTOFF - rank 40', 'Ranking Basis': 'FAILS CUTOFF - rank 40' }];
    expect(guessExclude(['Notes', 'Ranking Basis'], rows)).toEqual({ column: 'Notes', contains: 'FAILS CUTOFF' });
    expect(guessExclude(['Notes'], [{ Notes: 'fine' }])).toBeUndefined();
  });
});
