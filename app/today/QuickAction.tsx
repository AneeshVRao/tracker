'use client';

import { useState, useTransition } from 'react';
import { actContact } from '@/app/actions';
import type { Action, Outcome } from '@/lib/rules';

export function QuickAction({ id, action, outcome, label }: { id: number; action: Action; outcome?: Outcome; label: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  return (
    <span className="inline-flex items-center gap-2">
      <button className="btn" disabled={pending} onClick={() => start(async () => {
        const r = await actContact(id, action, outcome);
        setError(r.ok ? '' : 'error' in r ? r.error : 'Weekly invite cap reached');
      })}>{label}</button>
      {error && <span role="alert" className="text-xs text-bad">{error}</span>}
    </span>
  );
}
