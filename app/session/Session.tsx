'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { actContact, undoContact } from '@/app/actions';
import { ArrowLeftIcon, ArrowRightIcon } from '@phosphor-icons/react';
import { Composer } from '@/app/contacts/Composer';
import { norm, type EmailConfidence } from '@/lib/parse';

export type SessionItem = {
  id: number; name: string; role: string | null; org: string | null; list_name: string; channel: 'email' | 'linkedin';
  email: string | null; email_confidence: EmailConfidence | null; linkedin_url: string | null;
  next_deadline: string | null; mutual: string | null; priority: number;
  subject: string; body: string; canSaveMessage: boolean;
  best: { tz: string; theirs: string; good: boolean; slotTheirs: string | null; slotMine: string | null } | null; dup_list: string | null;
};
type Props = {
  ids: number[]; n: number; initialItems: SessionItem[]; total: number; deferred: number;
  orgsToday: Record<string, number>; companyMax: number; invites: { used: number; cap: number };
};
type Done = Record<number, 'sent' | 'skipped'>;

export function Session({ ids, n, initialItems, total, deferred, orgsToday, companyMax, invites }: Props) {
  const router = useRouter();
  const [items] = useState(initialItems); // frozen: server revalidation must not shift the batch
  const [totalAtStart] = useState(total);
  const busy = useRef(false);
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
    if (!item || done[item.id] || busy.current) return;
    busy.current = true;
    start(async () => {
      try {
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
      } finally { busy.current = false; }
    });
  };

  const undo = () => {
    const last = history[history.length - 1];
    if (last === undefined) { setMsg('Nothing to undo in this session.'); return; }
    if (busy.current) return;
    busy.current = true;
    start(async () => {
      try {
      if (!(await undoContact(last, ['sent', 'skipped']))) {
        setHistory(h => h.slice(0, -1)); setMsg("Can't undo — that contact changed since."); return;
      }
      const it = items.find(x => x.id === last)!;
      if (done[last] === 'sent') {
        if (it.org) setOrgCount(oc => ({ ...oc, [norm(it.org!)]: Math.max(0, (oc[norm(it.org!)] ?? 1) - 1) }));
        if (it.channel === 'linkedin') setUsed(u => Math.max(0, u - 1));
      }
      const d = { ...done }; delete d[last];
      setDone(d); setHistory(h => h.slice(0, -1)); setI(items.findIndex(x => x.id === last)); setLimitHit(false); setMsg('');
      } finally { busy.current = false; }
    });
  };

  const move = (d: number) => { setI(x => Math.min(Math.max(x + d, 0), items.length)); setLimitHit(false); setMsg(''); };
  const click = (cmd: string) => (document.querySelector(`[data-cmd="${cmd}"]`) as HTMLElement | null)?.click();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable;
      if (e.key === 'Escape') { e.preventDefault(); if (typing) t.blur(); else router.push('/today'); return; }
      if (e.repeat) return;
      if (typing || e.metaKey || e.ctrlKey || e.altKey || pending) return;
      const k = e.key.toLowerCase();
      if (k === 'c') click('copy');
      else if (k === 'o') click('open');
      else if (k === 'x') click('checks');
      else if (k === 's') act('sent');
      else if (k === 'k') act('skip');
      else if (k === 'e') (document.querySelector('[data-cmd="edit"]') as HTMLElement | null)?.focus();
      else if (k === 'u') undo();
      else if (e.key === 'ArrowRight') move(1);
      else if (e.key === 'ArrowLeft') move(-1);
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
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 p-6 pb-0">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
        <span className="rounded-full bg-sunken px-2.5 py-0.5 text-[13px] font-semibold tabular-nums text-fg">{Math.min(i + 1, items.length)} / {items.length}</span>
        <span>{sent} sent · {acted - sent} skipped</span>
        {eta && <span>~{eta} min left</span>}
        {hasLinkedIn && <span className={pct >= 1 ? 'text-bad' : pct >= 0.8 ? 'text-warn' : ''}>Invites this week {used}/{invites.cap}</span>}
        {(deferred > 0 || totalAtStart > items.length) && <span>{totalAtStart - items.length > 0 ? `${totalAtStart - items.length} more after this batch` : ''}{deferred ? ` · ${deferred} held for company spacing` : ''}</span>}
        <Link href="/today" className="ml-auto rounded-md px-1.5 py-0.5 hover:bg-line/60 hover:text-fg">Exit (Esc)</Link>
      </header>
      <div aria-hidden className="-mt-2 h-0.5 overflow-hidden rounded-full bg-line"><div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${items.length ? (acted / items.length) * 100 : 0}%` }} /></div>

      {!item ? (
        <div className="card space-y-3 p-6 text-center">
          <h1 className="page-title">Batch done</h1>
          <p className="text-muted">{items.length ? `${sent} sent, ${acted - sent} skipped.` : 'Nothing to send in these lists right now.'}</p>
          <div className="flex justify-center gap-2">
            <Link href="/today" className="btn">Back to Today</Link>
            {items.length > 0 && <button className="btn-primary" onClick={() => router.push(`/session?lists=${ids.join(',')}&n=${n}&b=${Date.now()}`)}>Next batch</button>}
          </div>
        </div>
      ) : (
        <article className="card space-y-4 p-6">
          <header className="space-y-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <h1 className="font-display text-[26px] leading-tight font-medium">{item.name}</h1>
              {done[item.id] && <span className="rounded-full border border-good/30 bg-good/10 px-2 py-px text-xs font-medium text-good">{done[item.id] === 'sent' ? 'Sent' : 'Skipped'}</span>}
            </div>
            <p className="text-[14px] text-fg/80">{[item.role, item.org].filter(Boolean).join(' · ')}</p>
            <p className="flex flex-wrap gap-x-3 text-xs text-muted">
              <span>{item.list_name}</span>
              <span>Priority {['', 'low', 'medium', 'high'][item.priority]}</span>
              {item.next_deadline && <span className="text-warn">Deadline {item.next_deadline}</span>}
              {item.mutual && <span>Mutual: {item.mutual}</span>}
            </p>
            {item.dup_list && <p role="alert" className="notice-warn">Already contacted via {item.dup_list}. Don&apos;t message the same person twice — skip (K).</p>}
            {item.best && (item.best.good
              ? <p className="notice-good">Good time to send: it&apos;s {item.best.theirs} for them.</p>
              : <p className="text-xs text-muted">Their time {item.best.theirs}. Best slot {item.best.slotTheirs} theirs ({item.best.slotMine} yours). Use Gmail Schedule send.</p>)}
          </header>

          {orgFull(item, orgCount) && !done[item.id] && (
            <p role="status" className="notice-warn">You already contacted someone at {item.org} today. Skip for now (→) or send anyway (S).</p>
          )}

          <Composer
            key={item.id}
            id={item.id} channel={item.channel} to={item.email} confidence={item.email_confidence} linkedinUrl={item.linkedin_url}
            subject={item.subject} body={item.body} firstEmail={item.channel === 'email'} canSaveMessage={item.canSaveMessage}
          />

          <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-4">
            <button className="btn-primary" disabled={pending || !!done[item.id]} onClick={() => act('sent')}>Mark sent <kbd className="kbd">S</kbd></button>
            <button className="btn" disabled={pending || !!done[item.id]} onClick={() => act('skip')}>Skip <kbd className="kbd">K</kbd></button>
            <button className="btn" disabled={pending} onClick={undo}>Undo <kbd className="kbd">U</kbd></button>
            <span className="ml-auto flex gap-1.5">
              <button className="btn" aria-label="Previous contact" disabled={i === 0} onClick={() => move(-1)}><ArrowLeftIcon size={15} aria-hidden /></button>
              <button className="btn" aria-label="Next contact" onClick={() => move(1)}><ArrowRightIcon size={15} aria-hidden /></button>
            </span>
          </div>

          {limitHit && (
            <div role="alert" className="notice-warn flex flex-wrap items-center gap-2">
              You&apos;ve reached {used}/{invites.cap} LinkedIn invites this week. Sending more risks a restriction.
              <button className="btn" disabled={pending} onClick={() => act('sent', true)}>Send anyway</button>
            </div>
          )}
          {msg && <p role="alert" className="notice-bad">{msg}</p>}
        </article>
      )}

      <footer className="sticky bottom-0 -mx-6 mt-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-line bg-bg px-6 py-2.5 text-xs text-muted [&>span]:inline-flex [&>span]:items-center [&>span]:gap-1">
        <span><kbd className="kbd">C</kbd> copy</span><span><kbd className="kbd">O</kbd> open</span><span><kbd className="kbd">X</kbd> checklist</span><span><kbd className="kbd">S</kbd> sent</span><span><kbd className="kbd">K</kbd> skip</span><span><kbd className="kbd">E</kbd> edit</span><span><kbd className="kbd">U</kbd> undo</span><span><kbd className="kbd">←</kbd><kbd className="kbd">→</kbd> move</span><span><kbd className="kbd">Esc</kbd> exit</span>
      </footer>
    </div>
  );
}
