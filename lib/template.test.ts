import { describe, expect, test } from 'vitest';
import { DEFAULT_TEMPLATES, gmailComposeUrl, hasBlockers, pickTemplate, render } from './template';

const ctx = { name: 'Prof. Jane Doe', org: 'IIT Bombay', role: 'Associate Professor', message: 'Your RECAST idea maps onto my retrieval work.', extra: { 'Most Relevant Paper(s)': 'RECAST', Empty: '' } };

describe('render', () => {
  test('names, honorific stripped, col placeholders', () =>
    expect(render('Dear Prof. {{last_name}} ({{first_name}}) at {{org}}: "{{col:Most Relevant Paper(s)}}" {{message}}', ctx).text)
      .toBe('Dear Prof. Doe (Jane) at IIT Bombay: "RECAST" Your RECAST idea maps onto my retrieval work.'));
  test('missing values are marked and listed', () => {
    const r = render('{{col:Empty}} {{col:Nope}} {{bogus}}', ctx);
    expect(r.text).toBe('[[missing: col:Empty]] [[missing: col:Nope]] [[missing: bogus]]');
    expect(r.missing).toEqual(['col:Empty', 'col:Nope', 'bogus']);
  });
  test('prototype keys are treated as missing, not crashes', () => {
    const r = render('{{constructor}} {{col:toString}}', ctx);
    expect(r.text).toBe('[[missing: constructor]] [[missing: col:toString]]');
  });
  test('default email body renders with edit markers that block copying', () => {
    const r = render(DEFAULT_TEMPLATES.email.body, ctx);
    expect(r.missing).toEqual([]);
    expect(hasBlockers(r.text)).toBe(true);
  });
  test('default linkedin body is the sheet note', () => expect(render(DEFAULT_TEMPLATES.linkedin.body, ctx).text).toBe(ctx.message));
  test('hasBlockers', () => {
    expect(hasBlockers('fine text')).toBe(false);
    expect(hasBlockers('x [[edit: add a line]] y')).toBe(true);
  });
});

describe('pickTemplate', () => {
  test.each([
    ['to_contact', 0, 'email', 'body'], ['sent', 1, 'email', 'followup1'], ['sent', 2, 'email', 'followup2'], ['sent', 3, 'email', 'followup2'],
    ['to_contact', 0, 'linkedin', 'body'], ['accepted', 1, 'linkedin', 'after_accept'], ['sent', 1, 'linkedin', 'body'],
  ] as const)('%s step %i %s → %s', (status, step, ch, key) => expect(pickTemplate(status, step, ch)).toBe(key));
});

describe('gmailComposeUrl', () => {
  test('short body inline', () => {
    const r = gmailComposeUrl('a@b.edu', 'Hi & hello', 'Body text');
    expect(r).toEqual({ url: 'https://mail.google.com/mail/?view=cm&fs=1&to=a%40b.edu&su=Hi%20%26%20hello&body=Body%20text', bodyCopied: false });
  });
  test('long body dropped from URL, flagged for clipboard', () => {
    const r = gmailComposeUrl('a@b.edu', 'S', 'é'.repeat(400)); // 400 chars → 2400 encoded
    expect(r.bodyCopied).toBe(true);
    expect(r.url).not.toContain('body=');
  });
});
