'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { actContact, undoContact } from '@/app/actions';
import { Composer } from '@/app/contacts/Composer';
import { norm, type EmailConfidence } from '@/lib/parse';

export type SessionItem = {
  id: number; name: string; role: string | null; org: string | null; list_name: string; channel: 'email' | 'linkedin';
  email: string | null; email_confidence: EmailConfidence | null; linkedin_url: string | null;
  next_deadline: string | null; mutual: string | null; priority: number;
  subject: string; body: string; canSaveMessage: boolean;
};
type Props = {
  items: SessionItem[]; total: number; deferred: number;
  orgsToday: Record<string, number>; companyMax: number; invites: { used: number; cap: number };
};
type Done = Record<number, 'sent' | 'skipped'>;

export function Session({ items, total, deferred, orgsToday, companyMax, invites }: Props) {
  const router = useRouter();
  const [i, setI] = useState(0);
  const [done, setDone] = useState<Done>({});
  const [orgCount, setOrgCount] = useState<Record<string, number>>(orgsToday);
  const [used, setUsed] = useState(invites.used);
  const [history, setHistory] = useState<number[]>([]);
  const [limitHit, setLimitHit] = useState(false);
  const [msg, setMsg] = useState('');
  const [pending, start] = useTransition();
  const startedAt = useRef(Date.now());
  const item = items[i];

  const orgFull = (it: SessionItem, oc: Record<string, number>) => !!it.org && (oc[norm(it.org)] ?? 0) >= companyMax;
  const nextIndex = (from: number, d: Done, oc: Record<string, number>) => {
    for (let j = from + 1; j < items.length; j++) if (!d[items[j].id] && !orgFull(items[j], oc)) return j;
    return items.length;
  };

  const act = (kind: 'sent' | 'skip', override = false) => {
    if (!item || done[item.id]) return;
    start(async () => {
      setMsg('');
      const r = await actContact(item.id, kind, undefined, override);
      if (!r.ok) {
        if ('limit' in r) { setLimitHit(true); setUsed(r.limit.used); } else setMsg(r.error);
        return;
      }
      setLimitHit(false);
      const d: Done = { ...done, [item.id]: kind === 'sent' ? 'sent' : 'skipped' };
      let oc = orgCount;
      if (kind === 'sent') {
        if (item.org) oc = { ...oc, [norm(item.org)]: (oc[norm(item.org)] ?? 0) + 1 };
        if (item.channel === 'linkedin') setUsed(u => u + 1);
      }
      setDone(d); setOrgCount(oc); setHistory(h => [...h, item.id]); setI(nextIndex(i, d, oc));
    });
  };

  const undo = () => {
    const last = history[history.length - 1];
    if (last === undefined) { setMsg('Nothing to undo in this session.'); return; }
    start(async () => {
      if (!(await undoContact(last))) { setMsg('Nothing to undo.'); return; }
      const it = items.find(x => x.id === last)!;
      if (done[last] === 'sent') {
        if (it.org) setOrgCount(oc => ({ ...oc, [norm(it.org!)]: Math.max(0, (oc[norm(it.org!)] ?? 1) - 1) }));
        if (it.channel === 'linkedin') setUsed(u => Math.max(0, u - 1));
      }
      const d = { ...done }; delete d[last];
      setDone(d); setHistory(h => h.slice(0, -1)); setI(items.findIndex(x => x.id === last)); setLimitHit(false);
    });
  };

  const click = (cmd: string) => (document.querySelector(`[data-cmd="${cmd}"]`) as HTMLElement | null)?.click();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable;
      if (e.key === 'Escape') { e.preventDefault(); if (typing) t.blur(); else router.push('/today'); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey || pending) return;
      const k = e.key.toLowerCase();
      if (k === 'c') click('copy');
      else if (k === 'o') click('open');
      else if (k === 's') act('sent');
      else if (k === 'k') act('skip');
      else if (k === 'e') (document.querySelector('[data-cmd="edit"]') as HTMLElement | null)?.focus();
      else if (k === 'u') undo();
      else if (e.key === 'ArrowRight') setI(n => Math.min(n + 1, items.length));
      else if (e.key === 'ArrowLeft') setI(n => Math.max(n - 1, 0));
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const acted = Object.keys(done).length;
  const sent = Object.values(done).filter(v => v === 'sent').length;
  const remaining = items.filter(x => !done[x.id]).length;
  const perItem = acted ? (Date.now() - startedAt.current) / acted : 0;
  const eta = acted && remaining ? Math.max(1, Math.round((perItem * remaining) / 60000)) : null;
  const hasLinkedIn = items.some(x => x.channel === 'linkedin');
  const pct = used / invites.cap;

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 p-6">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted">
        <span className="text-[13px] font-medium text-fg">{Math.min(i + 1, items.length)} / {items.length}</span>
        <span>{sent} sent · {acted - sent} skipped</span>
        {eta && <span>~{eta} min left</span>}
        {hasLinkedIn && <span className={pct >= 1 ? 'text-bad' : pct >= 0.8 ? 'text-warn' : ''}>Invites this week {used}/{invites.cap}</span>}
        {(deferred > 0 || total > items.length) && <span>{total - items.length > 0 ? `${total - items.length} more after this batch` : ''}{deferred ? ` · ${deferred} held for company spacing` : ''}</span>}
        <Link href="/today" className="ml-auto hover:text-fg">Exit (Esc)</Link>
      </header>

      {!item ? (
        <div className="card space-y-3 p-6 text-center">
          <h1 className="page-title">Batch done</h1>
          <p className="text-muted">{sent} sent, {acted - sent} skipped.</p>
          <div className="flex justify-center gap-2">
            <Link href="/today" className="btn">Back to Today</Link>
            <button className="btn-primary" onClick={() => router.refresh()}>Next batch</button>
          </div>
        </div>
      ) : (
        <article className="card space-y-4 p-5">
          <header className="space-y-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <h1 className="text-base font-semibold tracking-tight">{item.name}</h1>
              {done[item.id] && <span className="text-xs text-good">{done[item.id] === 'sent' ? 'Sent' : 'Skipped'}</span>}
            </div>
            <p className="text-muted">{[item.role, item.org].filter(Boolean).join(' · ')}</p>
            <p className="flex flex-wrap gap-x-3 text-xs text-muted">
              <span>{item.list_name}</span>
              <span>Priority {['', 'low', 'medium', 'high'][item.priority]}</span>
              {item.next_deadline && <span className="text-warn">Deadline {item.next_deadline}</span>}
              {item.mutual && <span>Mutual: {item.mutual}</span>}
            </p>
          </header>

          {orgFull(item, orgCount) && !done[item.id] && (
            <p role="status" className="text-xs text-warn">You already contacted someone at {item.org} today. Skip for now (→) or send anyway (S).</p>
          )}

          <Composer
            key={item.id}
            id={item.id} channel={item.channel} to={item.email} confidence={item.email_confidence} linkedinUrl={item.linkedin_url}
            subject={item.subject} body={item.body} firstEmail={item.channel === 'email'} canSaveMessage={item.canSaveMessage}
          />

          <div className="flex flex-wrap items-center gap-1.5">
            <button className="btn-primary" disabled={pending || !!done[item.id]} onClick={() => act('sent')}>Mark sent <kbd className="opacity-70">S</kbd></button>
            <button className="btn" disabled={pending || !!done[item.id]} onClick={() => act('skip')}>Skip <kbd className="opacity-70">K</kbd></button>
            <button className="btn" disabled={pending} onClick={undo}>Undo <kbd className="opacity-70">U</kbd></button>
            <span className="ml-auto flex gap-1.5">
              <button className="btn" aria-label="Previous contact" disabled={i === 0} onClick={() => setI(n => Math.max(0, n - 1))}>←</button>
              <button className="btn" aria-label="Next contact" onClick={() => setI(n => Math.min(n + 1, items.length))}>→</button>
            </span>
          </div>

          {limitHit && (
            <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-warn/40 bg-warn/10 px-2 py-1.5 text-xs text-warn">
              You&apos;ve reached {used}/{invites.cap} LinkedIn invites this week. Sending more risks a restriction.
              <button className="btn" disabled={pending} onClick={() => act('sent', true)}>Send anyway</button>
            </div>
          )}
          {msg && <p role="alert" className="text-xs text-bad">{msg}</p>}
        </article>
      )}

      <footer className="mt-auto text-center text-xs text-muted">
        <kbd>C</kbd> copy · <kbd>O</kbd> open · <kbd>S</kbd> sent · <kbd>K</kbd> skip · <kbd>E</kbd> edit · <kbd>U</kbd> undo · <kbd>←</kbd>/<kbd>→</kbd> move · <kbd>Esc</kbd> exit
      </footer>
    </div>
  );
}
