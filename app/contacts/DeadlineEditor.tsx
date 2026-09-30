'use client';

import { useState, useTransition } from 'react';
import { editContact } from '@/app/actions';

export function DeadlineEditor({ id, dates, manual, today }: { id: number; dates: string[]; manual: string | null; today: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const set = (v: string | null) => start(async () => {
    setError('');
    try { await editContact(id, 'deadline_manual', v); } catch { setError('Could not save that date.'); }
  });
  return (
    <div className="space-y-1.5">
      {dates.length > 0 && (
        <div className="flex flex-wrap gap-1" role="group" aria-label="Dates found in the sheet">
          {dates.map(d => (
            <button key={d} type="button" disabled={pending} onClick={() => set(d)}
              className={`rounded-full border px-2 py-px text-xs ${d === manual ? 'border-accent bg-accent/10 text-accent' : d < today ? 'border-line text-muted line-through' : 'border-line hover:border-fg/30'}`}
              aria-pressed={d === manual}>{d}</button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <input type="date" key={manual ?? ''} defaultValue={manual ?? ''} className="input" aria-label="Deadline to use"
          onBlur={e => { const v = e.target.value || null; if (v !== manual) set(v); }} />
        {manual && <button type="button" className="btn" disabled={pending} onClick={() => set(null)}>Use sheet dates</button>}
      </div>
      {error && <p role="alert" className="text-xs text-bad">{error}</p>}
    </div>
  );
}
