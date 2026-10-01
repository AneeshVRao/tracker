export type Status = 'to_contact' | 'sent' | 'accepted' | 'replied' | 'conversation' | 'closed' | 'skipped' | 'reference';
export type Channel = 'email' | 'linkedin';
export type Outcome = 'positive' | 'declined' | 'no_reply' | 'bounced' | 'withdrawn';
export type Action = 'sent' | 'skip' | 'accepted' | 'messaged' | 'nudged' | 'replied' | 'conversation' | 'checked_in' | 'close' | 'reopen';
export type EventType = 'imported' | 'sent' | 'skipped' | 'accepted' | 'messaged' | 'nudged' | 'replied' | 'status' | 'closed' | 'reopened' | 'note' | 'edited' | 'limit_override' | 'intro_requested';
export type State = { status: Status; outcome: Outcome | null; followup_step: number; follow_up_on: string | null; sent_at: string | null };

export type Settings = {
  weekly_invite_cap: number;
  company_daily_max: number;
  email_nudge_days: [number, number]; // after send; after each nudge
  linkedin_withdraw_days: number;
  after_accept_followup_days: number;
  checkin_days: number;
  projects: string[];
  my_timezone: string;
  my_name: string;
  my_first_name: string;
  my_intro: string;
  avail_from: string; // '' or YYYY-MM-DD
  avail_to: string;
  send_window: { days: number[]; from: number; to: number };
};

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze<Settings>({
  weekly_invite_cap: 100,
  company_daily_max: 1,
  email_nudge_days: [7, 7],
  linkedin_withdraw_days: 21,
  after_accept_followup_days: 7,
  checkin_days: 7,
  projects: ['ContextCraft', 'Uktam', 'RiskMesh', 'ShabdSetu'],
  my_timezone: 'Asia/Kolkata',
  my_name: '',
  my_first_name: '',
  my_intro: '',
  avail_from: '',
  avail_to: '',
  send_window: { days: [2, 3, 4], from: 9, to: 11 },
});

export const OPEN_STATUSES: Status[] = ['to_contact', 'sent', 'accepted', 'replied', 'conversation'];

export const STATUS_LABEL: Record<Status, string> = {
  to_contact: 'To contact', sent: 'Sent', accepted: 'Accepted', replied: 'Replied',
  conversation: 'In conversation', closed: 'Closed', skipped: 'Skipped', reference: 'Reference',
};
export const ACTION_LABEL: Record<Action, string> = {
  sent: 'Mark sent', skip: 'Skip', accepted: 'Accepted', messaged: 'Message sent', nudged: 'Nudge sent',
  replied: 'Replied', conversation: 'In conversation', checked_in: 'Checked in', close: 'Close…', reopen: 'Reopen',
};
export const OUTCOME_LABEL: Record<Outcome, string> = {
  positive: 'Positive', declined: 'Declined', no_reply: 'No reply', bounced: 'Bounced', withdrawn: 'Invite withdrawn',
};

// ---- dates (YYYY-MM-DD strings) --------------------------------------------
export const todayIn = (tz: string, d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// `dates` must be sorted ascending. A manual date only wins while it is still upcoming.
export const nextDeadline = (dates: string[], manual: string | null, today: string) =>
  (manual && manual >= today ? manual : null) ?? dates.find(d => d >= today) ?? null;

// ---- status machine (spec §8) ----------------------------------------------
export function allowedActions(s: State, ch: Channel): Action[] {
  const a: Action[] = [];
  switch (s.status) {
    case 'to_contact': a.push('sent', 'skip'); break;
    case 'sent':
      if (ch === 'linkedin') a.push('accepted');
      if (ch === 'email' && s.followup_step >= 1 && s.followup_step < 3) a.push('nudged');
      a.push('replied'); break;
    case 'accepted': a.push('messaged', 'replied'); break;
    case 'replied': a.push('conversation'); break;
    case 'conversation': a.push('checked_in', 'replied'); break;
    case 'closed': case 'skipped': a.push('reopen'); break;
  }
  if (['sent', 'accepted', 'replied', 'conversation'].includes(s.status)) a.push('close');
  return a;
}

export function outcomesFor(s: State, ch: Channel): Outcome[] {
  const o: Outcome[] = ['positive', 'declined', 'no_reply'];
  if (ch === 'email') o.push('bounced');
  if (ch === 'linkedin' && s.status === 'sent') o.push('withdrawn');
  return o;
}

export function applyAction(
  s: State, ch: Channel, action: Action,
  ctx: { today: string; now: string; outcome?: Outcome }, cfg: Settings,
): { patch: Partial<State>; event: EventType } {
  if (!allowedActions(s, ch).includes(action)) throw new Error(`Action "${action}" not allowed from "${s.status}"`);
  const plus = (n: number) => addDays(ctx.today, n);
  switch (action) {
    case 'sent':
      return { event: 'sent', patch: { status: 'sent', sent_at: ctx.now, followup_step: 1, follow_up_on: plus(ch === 'email' ? cfg.email_nudge_days[0] : cfg.linkedin_withdraw_days) } };
    case 'skip':
      return { event: 'skipped', patch: { status: 'skipped', follow_up_on: null } };
    case 'accepted':
      return { event: 'accepted', patch: { status: 'accepted', follow_up_on: ctx.today } };
    case 'messaged':
      return { event: 'messaged', patch: { status: 'conversation', follow_up_on: plus(cfg.after_accept_followup_days) } };
    case 'nudged':
      return { event: 'nudged', patch: { followup_step: s.followup_step + 1, follow_up_on: plus(cfg.email_nudge_days[1]) } };
    case 'replied':
      return { event: 'replied', patch: { status: 'replied', follow_up_on: null } };
    case 'conversation':
      return { event: 'status', patch: { status: 'conversation', follow_up_on: plus(cfg.checkin_days) } };
    case 'checked_in':
      return { event: 'messaged', patch: { follow_up_on: plus(cfg.checkin_days) } };
    case 'close':
      if (!ctx.outcome || !outcomesFor(s, ch).includes(ctx.outcome)) throw new Error('A valid outcome is required to close');
      return { event: 'closed', patch: { status: 'closed', outcome: ctx.outcome, follow_up_on: null } };
    case 'reopen':
      return { event: 'reopened', patch: { status: 'to_contact', outcome: null, followup_step: 0, follow_up_on: null } };
  }
}
