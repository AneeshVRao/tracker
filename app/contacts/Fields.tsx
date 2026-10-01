'use client';

import { useRef, useState, useTransition } from 'react';
import { editContact, saveNotes } from '@/app/actions';

export function FollowUp({ id, value }: { id: number; value: string | null }) {
  const [, start] = useTransition();
  const [error, setError] = useState('');
  const saved = useRef(value ?? '');
  return (
    <>
      <input type="date" defaultValue={value ?? ''} className="input" aria-label="Follow-up date"
        onBlur={e => {
          const v = e.target.value; if (v === saved.current) return;
          start(async () => { setError(''); const r = await editContact(id, 'follow_up_on', v || null); if (r.ok) saved.current = v; else setError(r.error); });
        }} />
      {error && <span role="alert" className="text-xs text-bad">{error}</span>}
    </>
  );
}

export function Notes({ id, value }: { id: number; value: string | null }) {
  const [, start] = useTransition();
  const [error, setError] = useState('');
  const saved = useRef(value ?? '');
  return (
    <>
      <textarea defaultValue={value ?? ''} rows={3} placeholder="Your notes (saved when you click away)" className="input w-full resize-y" aria-label="Your notes"
        onBlur={e => {
          const v = e.target.value; if (v === saved.current) return;
          start(async () => { setError(''); const r = await saveNotes(id, v); if (r.ok) saved.current = v; else setError(r.error); });
        }} />
      {error && <span role="alert" className="text-xs text-bad">{error}</span>}
    </>
  );
}
