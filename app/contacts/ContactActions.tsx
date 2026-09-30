'use client';

import { useState, useTransition } from 'react';
import { actContact, undoContact } from '@/app/actions';
import { ACTION_LABEL, OUTCOME_LABEL, type Action, type Outcome } from '@/lib/rules';

type Props = {
  id: number; actions: Action[]; outcomes: Outcome[]; canUndo: boolean;
  invites: { used: number; cap: number } | null; org: string | null; orgSentToday: number; companyMax: number;
};

export function ContactActions({ id, actions, outcomes, canUndo, invites, org, orgSentToday, companyMax }: Props) {
  const [pending, start] = useTransition();
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState('');
  const [limit, setLimit] = useState<{ used: number; cap: number } | null>(null);
  const [note, setNote] = useState('');

  const act = (action: Action, outcome?: Outcome, override = false) => start(async () => {
    setError(''); setLimit(null); setNote('');
    const r = await actContact(id, action, outcome, override);
    if (r.ok) { setClosing(false); setLimit(null); return; }
    if ('limit' in r) setLimit(r.limit); else setError(r.error);
  });
  const undo = () => start(async () => {
    setError(''); setLimit(null);
    try { if (!(await undoContact(id))) setNote('Nothing to undo.'); } catch { setError('Undo failed. Reload and try again.'); }
  });
  const nearCap = invites && invites.used >= invites.cap * 0.8;

  return (
    <div className="space-y-2">
      {invites && actions.includes('sent') && (
        <p className={`text-xs ${nearCap ? 'text-warn' : 'text-muted'}`}>LinkedIn invites this week: {invites.used}/{invites.cap}</p>
      )}
      {org && orgSentToday >= companyMax && actions.includes('sent') && (
        <p className="text-xs text-warn">Already sent to {orgSentToday} {orgSentToday === 1 ? 'person' : 'people'} at {org} today. Consider waiting until tomorrow.</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {actions.filter(a => a !== 'close').map(a => (
          <button key={a} disabled={pending} onClick={() => act(a)} className={a === 'sent' ? 'btn-primary' : 'btn'}>{ACTION_LABEL[a]}</button>
        ))}
        {actions.includes('close') && <button className="btn" disabled={pending} onClick={() => setClosing(v => !v)}>{ACTION_LABEL.close}</button>}
        {canUndo && <button className="btn ml-auto" disabled={pending} onClick={undo}>Undo last</button>}
      </div>
      {closing && (
        <div className="flex flex-wrap gap-1.5 border-l-2 border-line pl-2">
          {outcomes.map(o => <button key={o} className="btn" disabled={pending} onClick={() => act('close', o)}>{OUTCOME_LABEL[o]}</button>)}
        </div>
      )}
      {limit && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-warn/40 bg-warn/10 px-2 py-1.5 text-xs text-warn">
          You&apos;ve sent {limit.used}/{limit.cap} LinkedIn invites this week. Sending more risks a restriction.
          <button className="btn" disabled={pending} onClick={() => act('sent', undefined, true)}>Send anyway</button>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-bad">{error}</p>}
      {note && <p role="status" className="text-xs text-muted">{note}</p>}
    </div>
  );
}
