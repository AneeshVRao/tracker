'use client';

import { useState, useTransition } from 'react';
import { actContact, undoContact } from '@/app/actions';
import { ACTION_LABEL, OUTCOME_LABEL, type Action, type Outcome } from '@/lib/rules';

export function ContactActions({ id, actions, outcomes, canUndo }: { id: number; actions: Action[]; outcomes: Outcome[]; canUndo: boolean }) {
  const [pending, start] = useTransition();
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState('');
  const run = (fn: () => Promise<unknown>) => start(async () => {
    setError('');
    try { await fn(); setClosing(false); } catch { setError('That action failed. Reload and try again.'); }
  });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {actions.filter(a => a !== 'close').map(a => (
          <button key={a} disabled={pending} onClick={() => run(() => actContact(id, a))} className={a === 'sent' ? 'btn-primary' : 'btn'}>{ACTION_LABEL[a]}</button>
        ))}
        {actions.includes('close') && <button className="btn" disabled={pending} onClick={() => setClosing(v => !v)}>{ACTION_LABEL.close}</button>}
        {canUndo && <button className="btn ml-auto" disabled={pending} onClick={() => run(() => undoContact(id))}>Undo last</button>}
      </div>
      {closing && (
        <div className="flex flex-wrap gap-2">
          {outcomes.map(o => <button key={o} className="btn" disabled={pending} onClick={() => run(() => actContact(id, 'close', o))}>{OUTCOME_LABEL[o]}</button>)}
        </div>
      )}
      {error && <p role="alert" className="text-xs text-bad">{error}</p>}
    </div>
  );
}
