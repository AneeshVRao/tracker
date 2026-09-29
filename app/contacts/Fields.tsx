'use client';

import { useTransition } from 'react';
import { editContact, saveNotes } from '@/app/actions';

export function FollowUp({ id, value }: { id: number; value: string | null }) {
  const [, start] = useTransition();
  return (
    <input type="date" defaultValue={value ?? ''} className="input" aria-label="Follow-up date"
      onChange={e => { const v = e.target.value || null; start(() => editContact(id, 'follow_up_on', v)); }} />
  );
}

export function Notes({ id, value }: { id: number; value: string | null }) {
  const [, start] = useTransition();
  return (
    <textarea defaultValue={value ?? ''} rows={3} placeholder="Your notes (saved when you click away)" className="input w-full" aria-label="Your notes"
      onBlur={e => { const v = e.target.value; if (v !== (value ?? '')) start(() => saveNotes(id, v)); }} />
  );
}
