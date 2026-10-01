'use client';

import { useActionState, useState } from 'react';
import { saveSettingsAction } from '@/app/actions';
import type { Settings } from '@/lib/rules';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const ROWS = (s: Settings): [name: string, label: string, value: string | number, hint: string][] => [
  ['weekly_invite_cap', 'Weekly LinkedIn invite cap', s.weekly_invite_cap, 'Rolling 7 days. Warns at 80%, asks before going over.'],
  ['company_daily_max', 'Sends per company per day', s.company_daily_max, 'Across all lists. Extra people at the same organisation wait for tomorrow.'],
  ['nudge1', 'First email nudge after (days)', s.email_nudge_days[0], 'Counted from the day you sent the email.'],
  ['nudge2', 'Second nudge after (days)', s.email_nudge_days[1], 'Counted from the first nudge. Close as no reply comes the same number of days after the second.'],
  ['linkedin_withdraw_days', 'Withdraw pending invite after (days)', s.linkedin_withdraw_days, 'Unaccepted invites show up on Today to withdraw.'],
  ['after_accept_followup_days', 'Follow up after message (days)', s.after_accept_followup_days, 'After they accept and you message them.'],
  ['checkin_days', 'Check-in interval (days)', s.checkin_days, 'For contacts you are in conversation with.'],
  ['my_timezone', 'Your time zone', s.my_timezone, 'IANA name, e.g. Asia/Kolkata. Decides what "today" means.'],
  ['my_name', 'Your name', s.my_name, 'Used in templates as {{my_name}}.'],
  ['my_first_name', 'Your first name', s.my_first_name, 'Used in templates as {{my_first_name}}.'],
  ['my_intro', 'One line about you', s.my_intro, 'Used in templates as {{my_intro}}, e.g. "a third-year ECE undergraduate at Example Institute".'],
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
      <fieldset className="grid gap-1 px-4 py-3 sm:grid-cols-[15rem_1fr] sm:items-center sm:gap-3">
        <legend className="sr-only">Send window</legend>
        <span className="font-medium">Good send window</span>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-3">
            {DAYS.map((d, i) => (
              <label key={d} className="flex items-center gap-1">
                <input type="checkbox" name="send_days" value={i} defaultChecked={(state?.values?.send_days ?? s.send_window.days.join(',')).split(',').includes(String(i))} />{d}
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2">
            From <input name="send_from" type="number" min={0} max={23} defaultValue={state?.values?.send_from ?? s.send_window.from} className="input w-20" aria-label="Send from hour" />
            to <input name="send_to" type="number" min={0} max={23} defaultValue={state?.values?.send_to ?? s.send_window.to} className="input w-20" aria-label="Send to hour" />
            <span className="text-xs text-muted">Hours (0–23) in the recipient&apos;s local time. Used for the next good slot.</span>
          </div>
        </div>
      </fieldset>
      <div className="flex items-center gap-3 px-4 py-3">
        <button className="btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Save settings'}</button>
        {state && <p role={state.ok ? 'status' : 'alert'} className={`text-xs ${state.ok ? 'text-good' : 'text-bad'}`}>{state.message}</p>}
      </div>
    </form>
  );
}
