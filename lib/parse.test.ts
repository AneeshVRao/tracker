import { describe, expect, test } from 'vitest';
import { detectProject, mapStatus, nameOrgKey, normLinkedIn, parseDeadlines, parseDegree, parseEmail, parsePriority, personKey } from './parse';

describe('parseEmail', () => {
  test('verified', () => expect(parseEmail('jdoe@cs.example.edu (VERIFIED - listed on the faculty page)')).toEqual({ email: 'jdoe@cs.example.edu', confidence: 'verified' }));
  test('inferred', () => expect(parseEmail('rlee@cs.example.edu (INFERRED - standard institutional pattern, not individually confirmed)')).toEqual({ email: 'rlee@cs.example.edu', confidence: 'inferred' }));
  test('first label wins', () => expect(parseEmail('x@y.org (VERIFIED - earlier pass had inferred it)').confidence).toBe('verified'));
  test('"unverified" is not verified', () => expect(parseEmail('x@y.org (unverified)').confidence).toBe('unknown'));
  test.each(['not verified', 'could not be verified', 'un-verified', 'never verified'])('negated "%s" is not verified', label =>
    expect(parseEmail(`x@y.org (${label})`).confidence).toBe('unknown'));
  test('negated verified then inferred is inferred', () => expect(parseEmail('x@y.org (not verified; INFERRED)').confidence).toBe('inferred'));
  test('no address', () => expect(parseEmail('Not found')).toEqual({ email: null, confidence: null }));
  test('obfuscated address is not guessed', () => expect(parseEmail('name at) iis [g').email).toBeNull());
});

describe('normLinkedIn', () => {
  test('canonical form', () => expect(normLinkedIn('https://www.linkedin.com/in/jane-doe-4821/')).toBe('https://www.linkedin.com/in/jane-doe-4821'));
  test('strips query, lowercases, no www', () => expect(normLinkedIn('linkedin.com/in/Bo-Two?trk=x')).toBe('https://www.linkedin.com/in/bo-two'));
  test('decodes percent-encoding', () => expect(normLinkedIn('https://www.linkedin.com/in/r%C3%A9mi')).toBe('https://www.linkedin.com/in/rémi'));
  test('non-profile url', () => expect(normLinkedIn('https://example.com')).toBeNull());
});

describe('parsePriority', () => {
  test.each([
    ['Strong', 3], ['Strong (lab) / Weak (paper)', 3], ['High - core technical', 3],
    ['Moderate (low reachability)', 2], ['Medium - technical adjacent', 2],
    ['Weak - recommend drop', 1], ['Low - limited tech overlap', 1],
    ['Unassessed', 2], ['N/A', 2], ['', 2],
  ])('%s → %i', (input, expected) => expect(parsePriority(input)).toBe(expected));
});

describe('parseDegree', () => {
  test('mutual', () => expect(parseDegree('2nd - mutual: Priya Example')).toEqual({ degree: '2nd', mutual: 'Priya Example' }));
  test('plain 2nd', () => expect(parseDegree('2nd')).toEqual({ degree: '2nd', mutual: null }));
  test('3rd+', () => expect(parseDegree('3rd+')).toEqual({ degree: '3rd+', mutual: null }));
  test('empty', () => expect(parseDegree('')).toEqual({ degree: null, mutual: null }));
});

describe('parseDeadlines', () => {
  test.each<[string, string[]]>([
    ['SRFP: Nov 30, 2026', ['2026-11-30']],
    ["Academies' SRFP 2027: 30 Nov 2026; IIT Delhi SRFP 2027: not announced (2026 window was 16 Mar - 3 Apr 2026)", ['2026-04-03', '2026-11-30']],
    ['SRFP 2027: 30 November 2026 (per programmes.json / IAS announcement); otherwise cold email', ['2026-11-30']],
    ['IITB: Sep 23, 2026 (window Aug 23-Sep 23)', ['2026-09-23']],
    ['SFP 2027: not yet announced (2026 cycle closed Mar 2 2026; expect ~Feb 2027); SRFP 2027: Nov 30 2026', ['2026-03-02', '2026-11-30']],
    ['Extended till 5.30 PM, September 29th, 2026', ['2026-09-29']],
    ["SURGE-2026 registration was 'February 02, 2026 (4:00 PM) till February 22, 2026'", ['2026-02-02', '2026-02-22']],
    ['2026 cycle deadline was Monday, March 2, 2026', ['2026-03-02']],
    ['Feb 02-22, 2026', ['2026-02-22']],
    ['2026-09-25', ['2026-09-25']],
    // Known, accepted false positive: yearless "10 November" takes the next year mentioned (2027).
    ['10 November (no year printed - for the summer 2027 cycle this would be 10 Nov 2026)', ['2026-11-10', '2027-11-10']],
    ['N/A - cold email route', []],
    ['N/A - cold email route (Mitacs 2027 closed)', []],
    ['Feb 30, 2026', []],
    ['', []],
  ])('%s', (input, expected) => expect(parseDeadlines(input)).toEqual(expected));
});

describe('mapStatus', () => {
  test.each([
    ['Not Started', 'to_contact'], ['Not started', 'to_contact'], ['Not sent', 'to_contact'], ['', 'to_contact'],
    ['Dropped', 'skipped'], ['Sent', 'sent'], ['Replied', 'replied'], ['Studying', 'to_contact'],
  ])('%s → %s', (input, expected) => expect(mapStatus(input)).toBe(expected));
});

describe('keys and projects', () => {
  test('detectProject uses list order, case-insensitive', () =>
    expect(detectProject("Hi Alex, NITW ECE '28 here. I recently built RiskMesh, a contextcraft fan", ['ContextCraft', 'RiskMesh'])).toBe('ContextCraft'));
  test('detectProject none', () => expect(detectProject(null, ['ContextCraft'])).toBeNull());
  test('personKey prefers linkedin, then email, then name|org', () => {
    expect(personKey({ linkedin_url: 'L', email: 'E', name: 'N', org: 'O' })).toBe('L');
    expect(personKey({ linkedin_url: null, email: 'E', name: 'N', org: 'O' })).toBe('E');
    expect(personKey({ linkedin_url: null, email: null, name: ' Jane  Doe ', org: 'Example University' })).toBe('jane doe|example university');
  });
  test('nameOrgKey tolerates null org', () => expect(nameOrgKey('A', null)).toBe('a|'));
});

describe('parse robustness', () => {
  test('the word "may" is not a yearless month', () => expect(parseDeadlines('This may 3 be delayed; decision in 2027')).toEqual([]));
  test('full May dates still parse', () => expect(parseDeadlines('Closes May 15, 2027')).toEqual(['2027-05-15']));
  test('mutual stops at a line break', () => expect(parseDegree('2nd - mutual: Priya Example\nsee notes')).toEqual({ degree: '2nd', mutual: 'Priya Example' }));
});
