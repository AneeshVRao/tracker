import type { Contact, List } from './db';
import type { Channel, Settings, Status } from './rules';

export type TemplateSet = { subject: string; body: string; followup1: string; followup2: string; after_accept: string };
export type TemplateKey = keyof TemplateSet;
export type TemplateContext = { name: string; org: string | null; role: string | null; message: string | null; extra: Record<string, string>; me?: { name: string; first_name: string; intro: string; dates: string } };

const SIGN_OFF = 'Best regards,\n{{my_name}}';

export const DEFAULT_TEMPLATES: Record<Channel, TemplateSet> = {
  email: {
    subject: 'Research internship inquiry ({{my_dates}}): {{my_name}}',
    body: `Dear Prof. {{last_name}},

I'm {{my_name}}, {{my_intro}}. I recently read your work "{{col:Most Relevant Paper(s)}}".

{{message}}

[[edit: one or two lines connecting this to your own project, see "Specific Overlap With My Work"]]

I would love to contribute to your group as a research intern ({{my_dates}}). My CV is attached, and I'm happy to share code or a short write-up.

${SIGN_OFF}`,
    followup1: `Dear Prof. {{last_name}},

Following up on my note from last week about a research internship in your group. I'd be grateful for a reply, even a brief "not this time".

${SIGN_OFF}`,
    followup2: `Dear Prof. {{last_name}},

One last follow-up on my internship inquiry. If someone else in your group would be a better person to contact, I'd appreciate a pointer.

Thank you for your time,
{{my_first_name}}`,
    after_accept: '',
  },
  linkedin: {
    subject: '',
    body: '{{message}}',
    followup1: '',
    followup2: '',
    after_accept: "Thanks for connecting, {{first_name}}! [[edit: one line on what you'd like to ask, e.g. a referral or a 15-minute chat]]",
  },
};

export const TEMPLATE_FIELDS: Record<Channel, [TemplateKey, string][]> = {
  email: [['subject', 'Subject'], ['body', 'First email'], ['followup1', 'Nudge 1 (day 7)'], ['followup2', 'Nudge 2 (day 14)']],
  linkedin: [['body', 'Connection note'], ['after_accept', 'Message after they accept']],
};

const RANGE_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
export function formatRange(from: string, to: string): string {
  return from && to ? `${RANGE_FMT.format(new Date(from))} – ${RANGE_FMT.format(new Date(to))}` : '';
}
export const meFrom = (s: Settings) => ({ name: s.my_name, first_name: s.my_first_name, intro: s.my_intro, dates: formatRange(s.avail_from, s.avail_to) });

const HONORIFIC = /^(prof(essor)?|dr|mr|ms|mrs)\.?\s+/i;
function nameParts(name: string) {
  const parts = name.replace(HONORIFIC, '').trim().split(/\s+/);
  return { first: parts[0] ?? '', last: parts[parts.length - 1] ?? '' };
}

export function render(tpl: string, c: TemplateContext): { text: string; missing: string[] } {
  const missing: string[] = [];
  const { first, last } = nameParts(c.name);
  const vars: Record<string, string | null> = { first_name: first, last_name: last, name: c.name, org: c.org, role: c.role, message: c.message, my_name: c.me?.name ?? null, my_first_name: c.me?.first_name ?? null, my_intro: c.me?.intro ?? null, my_dates: c.me?.dates ?? null };
  const text = tpl.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key: string) => {
    const [src, k] = key.startsWith('col:') ? [c.extra, key.slice(4).trim()] : [vars, key];
    const v = Object.hasOwn(src, k) ? src[k] : null;
    if (v == null || v.trim() === '') {
      missing.push(key);
      return `[[missing: ${key}]]`;
    }
    return v.trim();
  });
  return { text, missing };
}

export const PRESEND_CHECKS = [
  'Cites a specific paper or project of theirs',
  'Links one piece of my own work',
  'States my exact dates',
  'CV attached in Gmail (links cannot attach it)',
] as const;

export const hasBlockers = (text: string) => /\[\[[^\]]*\]\]/.test(text);

export function pickTemplate(status: Status, step: number, ch: Channel): TemplateKey {
  if (ch === 'email' && status === 'sent') return step >= 2 ? 'followup2' : 'followup1';
  if (ch === 'linkedin' && status === 'accepted') return 'after_accept';
  return 'body';
}

export function gmailComposeUrl(to: string, subject: string, body: string, max = 1800) {
  const base = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}`;
  const enc = encodeURIComponent(body);
  return enc.length > max ? { url: base, bodyCopied: true } : { url: `${base}&body=${enc}`, bodyCopied: false };
}

export type Composed = { key: TemplateKey; subject: string; body: string; canSaveMessage: boolean };

export function composeFor(
  c: Pick<Contact, 'name' | 'org' | 'role' | 'message' | 'extra' | 'status' | 'followup_step'>,
  list: Pick<List, 'channel' | 'templates'>,
  me?: TemplateContext['me'],
): Composed | null {
  if (!list.channel) return null;
  const tpl = JSON.parse(list.templates) as Partial<TemplateSet>;
  const key = pickTemplate(c.status, c.followup_step, list.channel);
  const ctx = { name: c.name, org: c.org, role: c.role, message: c.message, extra: JSON.parse(c.extra) as Record<string, string>, me };
  const subject = list.channel === 'email' ? render(key === 'body' ? tpl.subject ?? '' : `Re: ${tpl.subject ?? ''}`, ctx).text : '';
  return {
    key, subject, body: render(tpl[key] ?? '', ctx).text,
    canSaveMessage: list.channel === 'linkedin' && key === 'body' && (tpl.body ?? '').trim() === '{{message}}',
  };
}
