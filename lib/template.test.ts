import { describe, expect, test } from 'vitest';
import { DEFAULT_SETTINGS } from './rules';
import { DEFAULT_TEMPLATES, composeFor, formatRange, gmailComposeUrl, hasBlockers, meFrom, pickTemplate, render } from './template';

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
    const r = render(DEFAULT_TEMPLATES.email.body, { ...ctx, me: { name: 'Alex Student', first_name: 'Alex', intro: 'a student', dates: 'Dec 1, 2026 – Jan 15, 2027' } });
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

describe('composeFor', () => {
  const base = { name: 'Prof. Jane Doe', org: 'IIT Bombay', role: null, message: 'Angle', extra: JSON.stringify({ 'Most Relevant Paper(s)': 'RECAST' }), status: 'to_contact' as const, followup_step: 0 };
  const email = { channel: 'email' as const, templates: JSON.stringify({ subject: 'Hi {{org}}', body: 'Dear {{last_name}}: {{message}}', followup1: 'Nudge {{last_name}}', followup2: 'Last {{last_name}}', after_accept: '' }) };
  const linkedin = { channel: 'linkedin' as const, templates: JSON.stringify({ subject: '', body: '{{message}}', followup1: '', followup2: '', after_accept: 'Thanks {{first_name}}' }) };
  test('email first message', () =>
    expect(composeFor(base, email)).toEqual({ key: 'body', subject: 'Hi IIT Bombay', body: 'Dear Doe: Angle', canSaveMessage: false }));
  test('email second nudge uses Re: subject', () =>
    expect(composeFor({ ...base, status: 'sent', followup_step: 2 }, email)).toEqual({ key: 'followup2', subject: 'Re: Hi IIT Bombay', body: 'Last Doe', canSaveMessage: false }));
  test('linkedin note is saveable; after-accept is not', () => {
    expect(composeFor(base, linkedin)).toEqual({ key: 'body', subject: '', body: 'Angle', canSaveMessage: true });
    expect(composeFor({ ...base, status: 'accepted', followup_step: 1 }, linkedin)!.key).toBe('after_accept');
    expect(composeFor({ ...base, status: 'accepted', followup_step: 1 }, linkedin)!.canSaveMessage).toBe(false);
  });
  test('reference list → null', () => expect(composeFor(base, { channel: null, templates: '{}' })).toBeNull());
});

test('identity placeholders come from ctx.me; missing ones block copy', () => {
  const me = { name: 'Alex Student', first_name: 'Alex', intro: 'a third-year ECE undergraduate at Example Institute', dates: 'Dec 1, 2026 – Jan 15, 2027' };
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
