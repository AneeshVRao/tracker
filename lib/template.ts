import type { Channel, Status } from './rules';

export type TemplateSet = { subject: string; body: string; followup1: string; followup2: string; after_accept: string };
export type TemplateKey = keyof TemplateSet;
export type TemplateContext = { name: string; org: string | null; role: string | null; message: string | null; extra: Record<string, string> };

const SIGN_OFF = 'Best regards,\nAneesh Venkatesha Rao\nECE, NIT Warangal';

export const DEFAULT_TEMPLATES: Record<Channel, TemplateSet> = {
  email: {
    subject: 'Prospective research intern from NIT Warangal (ECE)',
    body: `Dear Prof. {{last_name}},

I'm Aneesh Venkatesha Rao, a third-year ECE undergraduate at NIT Warangal. I recently read your work "{{col:Most Relevant Paper(s)}}".

{{message}}

[[edit: one or two lines connecting this to your own project, see "Specific Overlap With My Work"]]

I would love to contribute to your group as a research intern ([[edit: your target window]]). My CV is attached, and I'm happy to share code or a short write-up.

${SIGN_OFF}`,
    followup1: `Dear Prof. {{last_name}},

Following up on my note from last week about a research internship in your group. I'd be grateful for a reply, even a brief "not this time".

${SIGN_OFF}`,
    followup2: `Dear Prof. {{last_name}},

One last follow-up on my internship inquiry. If someone else in your group would be a better person to contact, I'd appreciate a pointer.

Thank you for your time,
Aneesh`,
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

const HONORIFIC = /^(prof(essor)?|dr|mr|ms|mrs)\.?\s+/i;
function nameParts(name: string) {
  const parts = name.replace(HONORIFIC, '').trim().split(/\s+/);
  return { first: parts[0] ?? '', last: parts[parts.length - 1] ?? '' };
}

export function render(tpl: string, c: TemplateContext): { text: string; missing: string[] } {
  const missing: string[] = [];
  const { first, last } = nameParts(c.name);
  const vars: Record<string, string | null> = { first_name: first, last_name: last, name: c.name, org: c.org, role: c.role, message: c.message };
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
