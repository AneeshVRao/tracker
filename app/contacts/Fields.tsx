'use client';

import { useRef, useTransition } from 'react';
import { editContact, saveNotes } from '@/app/actions';

export function FollowUp({ id, value }: { id: number; value: string | null }) {
  const [, start] = useTransition();
  const saved = useRef(value ?? '');
  return (
    <input type="date" defaultValue={value ?? ''} className="input" aria-label="Follow-up date"
      onBlur={e => { const v = e.target.value; if (v === saved.current) return; saved.current = v; start(() => editContact(id, 'follow_up_on', v || null)); }} />
  );
}

export function Notes({ id, value }: { id: number; value: string | null }) {
  const [, start] = useTransition();
  const saved = useRef(value ?? '');
  return (
    <textarea defaultValue={value ?? ''} rows={3} placeholder="Your notes (saved when you click away)" className="input w-full" aria-label="Your notes"
      onBlur={e => { const v = e.target.value; if (v !== saved.current) { saved.current = v; start(() => saveNotes(id, v)); } }} />
  );
}
