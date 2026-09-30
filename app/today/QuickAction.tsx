'use client';

import { useState, useTransition } from 'react';
import { actContact } from '@/app/actions';
import type { Action, Outcome } from '@/lib/rules';

export function QuickAction({ id, name, action, outcome, label }: { id: number; name: string; action: Action; outcome?: Outcome; label: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  return (
    <span className="inline-flex items-center gap-2">
      <button className="btn" disabled={pending} aria-label={`${label}: ${name}`} onClick={() => start(async () => {
        setError('');
        const r = await actContact(id, action, outcome);
        setError(r.ok ? '' : 'error' in r ? r.error : 'Weekly invite cap reached');
      })}>{label}</button>
      {error && <span role="alert" className="text-xs text-bad">{error}</span>}
    </span>
  );
}
