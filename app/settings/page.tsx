import { getDb } from '@/lib/db';
import { getSettings } from '@/lib/queries';
import { SettingsForm } from './SettingsForm';

export default function SettingsPage() {
  const s = getSettings(getDb());
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="page-title">Settings</h1>
      {!s.my_name && <p role="status" className="notice-warn text-[13px]">Set your name so message templates can sign off for you.</p>}
      <p className="max-w-[65ch] text-muted">Timings for follow-ups and the LinkedIn safety limits. Changes apply to the next action you take; existing follow-up dates stay as they are.</p>
      <SettingsForm s={s} />
    </div>
  );
}

export const metadata = { title: 'Settings' };
