'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { markIntroAsked } from '@/app/actions';

type C = { id: number; name: string; org: string | null; role: string | null; list_name: string; asked_at: string | null };

export function IntroCard({ mutual, contacts }: { mutual: string; contacts: C[] }) {
  const first = mutual.split(/\s+/)[0];
  const who = contacts.map(c => (c.org ? `${c.name} (${c.org})` : c.name)).join(', ');
  const [text, setText] = useState(
    `Hi ${first}, hope you're doing well! I'm a third-year ECE student at NIT Warangal looking for internship opportunities. I noticed you're connected with ${who}. Would you be open to a quick intro? I'm happy to send a short blurb you can forward.\n\nThanks so much!\nAneesh`,
  );
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const lastAsked = contacts.map(c => c.asked_at).filter(Boolean).sort().at(-1);

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setMsg({ ok: true, text: 'Copied.' }); }
    catch { setMsg({ ok: false, text: "Couldn't copy — select the text and copy manually." }); }
  };

  return (
    <section className="card space-y-3 p-4">
      <header className="flex flex-wrap items-baseline gap-2">
        <h2 className="font-medium">{mutual}</h2>
        <span className="text-xs text-muted">knows {contacts.length} {contacts.length === 1 ? 'person' : 'people'} you want to reach</span>
        {lastAsked && <span className="ml-auto text-xs text-muted">Asked {lastAsked.slice(0, 10)}</span>}
      </header>
      <ul className="space-y-0.5 text-xs">
        {contacts.map(c => (
          <li key={c.id}>
            <Link href={`/contacts?open=${c.id}`} className="font-medium hover:text-accent">{c.name}</Link>
            <span className="text-muted"> · {[c.role, c.org, c.list_name].filter(Boolean).join(' · ')}</span>
          </li>
        ))}
      </ul>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={5} className="input w-full text-[13px] leading-relaxed" aria-label={`Intro request to ${mutual}`} />
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className="btn-primary" onClick={copy}>Copy message</button>
        <button type="button" className="btn" disabled={pending} onClick={() => start(async () => {
          const r = await markIntroAsked(contacts.map(c => c.id), mutual);
          setMsg({ ok: r.ok, text: r.message });
        })}>Mark as asked</button>
        {msg && <span role={msg.ok ? 'status' : 'alert'} className={`text-xs ${msg.ok ? 'text-good' : 'text-bad'}`}>{msg.text}</span>}
      </div>
    </section>
  );
}
