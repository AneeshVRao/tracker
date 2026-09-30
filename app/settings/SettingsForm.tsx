'use client';

import { useActionState, useState } from 'react';
import { saveSettingsAction } from '@/app/actions';
import type { Settings } from '@/lib/rules';

const ROWS = (s: Settings): [name: string, label: string, value: string | number, hint: string][] => [
  ['weekly_invite_cap', 'Weekly LinkedIn invite cap', s.weekly_invite_cap, 'Rolling 7 days. Warns at 80%, asks before going over.'],
  ['company_daily_max', 'Sends per company per day', s.company_daily_max, 'Across all lists. Extra people at the same organisation wait for tomorrow.'],
  ['nudge1', 'First email nudge after (days)', s.email_nudge_days[0], 'Counted from the day you sent the email.'],
  ['nudge2', 'Second nudge after (days)', s.email_nudge_days[1], 'Counted from the first nudge. Close as no reply comes the same number of days after the second.'],
  ['linkedin_withdraw_days', 'Withdraw pending invite after (days)', s.linkedin_withdraw_days, 'Unaccepted invites show up on Today to withdraw.'],
  ['after_accept_followup_days', 'Follow up after message (days)', s.after_accept_followup_days, 'After they accept and you message them.'],
  ['checkin_days', 'Check-in interval (days)', s.checkin_days, 'For contacts you are in conversation with.'],
  ['my_timezone', 'Your time zone', s.my_timezone, 'IANA name, e.g. Asia/Kolkata. Decides what "today" means.'],
  ['projects', 'Projects to track in notes', s.projects.join(', '), 'Comma-separated. Used to see which project gets replies.'],
];

export function SettingsForm({ s }: { s: Settings }) {
  const [state, action, pending] = useActionState(saveSettingsAction, null);
  // React resets the form after an action; remount on each result so failed input survives via state.values.
  const [seen, setSeen] = useState(state);
  const [gen, setGen] = useState(0);
  if (state !== seen) { setSeen(state); setGen(gen + 1); }
  return (
    <form key={gen} action={action} className="card divide-y divide-line">
      {ROWS(s).map(([name, label, value, hint]) => (
        <label key={name} className="grid gap-1 px-4 py-3 sm:grid-cols-[15rem_12rem_1fr] sm:items-center sm:gap-3">
          <span className="font-medium">{label}</span>
          <input name={name} defaultValue={state?.values?.[name] ?? String(value)} className="input" />
          <span className="text-xs text-muted">{hint}</span>
        </label>
      ))}
      <div className="flex items-center gap-3 px-4 py-3">
        <button className="btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Save settings'}</button>
        {state && <p role={state.ok ? 'status' : 'alert'} className={`text-xs ${state.ok ? 'text-good' : 'text-bad'}`}>{state.message}</p>}
      </div>
    </form>
  );
}
