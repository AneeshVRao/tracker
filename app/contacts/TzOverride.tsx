'use client';

import { useState, useTransition } from 'react';
import { editContact } from '@/app/actions';

export function TzOverride({ id, value }: { id: number; value: string | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  return (
    <span className="inline-flex items-center gap-1.5">
      <input key={value ?? ''} defaultValue={value ?? ''} placeholder="e.g. America/Los_Angeles" className="input w-52" aria-label="Recipient time zone override"
        disabled={pending}
        onBlur={e => {
          const v = e.target.value.trim() || null;
          if (v === value) return;
          start(async () => { setError(''); const r = await editContact(id, 'tz', v); if (!r.ok) setError(r.error); });
        }} />
      {error && <span role="alert" className="text-xs text-bad">{error}</span>}
    </span>
  );
}
