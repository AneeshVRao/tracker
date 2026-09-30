import Link from 'next/link';
import { StatusChip } from '@/app/ui';
import type { ContactDetail } from '@/lib/queries';
import { allowedActions, outcomesFor, OUTCOME_LABEL, STATUS_LABEL } from '@/lib/rules';
import { composeFor } from '@/lib/template';
import { Composer } from './Composer';
import { ContactActions } from './ContactActions';
import { FollowUp, Notes } from './Fields';

const EVENT_LABEL: Record<string, string> = {
  imported: 'Imported', sent: 'Sent', skipped: 'Skipped', accepted: 'Accepted', messaged: 'Messaged', nudged: 'Nudged',
  replied: 'Replied', status: 'Status changed', closed: 'Closed', reopened: 'Reopened', edited: 'Edited', note: 'Note',
};

export function ContactPanel({ d, closeHref }: { d: ContactDetail; closeHref: string }) {
  const { contact: c, list, events, alsoIn, canUndo } = d;
  const extra = JSON.parse(c.extra) as Record<string, string>;
  const channel = list.channel;
  const composed = composeFor(c, list);

  return (
    <div className="space-y-5 p-5 text-[13px]">
      <header className="space-y-1">
        <div className="flex items-start gap-2">
          <h2 className="flex-1 text-base font-semibold tracking-tight">{c.name}</h2>
          <Link href={closeHref} scroll={false} className="-mr-1 rounded px-1.5 py-0.5 text-muted hover:bg-sunken hover:text-fg" aria-label="Close panel">✕</Link>
        </div>
        <p className="text-muted">{[c.role, c.org, c.country].filter(Boolean).join(' · ')}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-xs">
          <StatusChip s={c.status} />
          {c.outcome && <span className="text-muted">{OUTCOME_LABEL[c.outcome]}</span>}
          <span className="text-muted">{list.name}</span>
          <span className="text-muted">Priority {['', 'low', 'medium', 'high'][c.priority]}</span>
          {c.mutual && <span className="text-muted">Mutual: {c.mutual}</span>}
          {alsoIn.map(a => <span key={a.list} className="rounded bg-warn/15 px-1.5 text-warn">Also in {a.list} ({STATUS_LABEL[a.status]})</span>)}
        </div>
      </header>

      {channel && (
        <ContactActions key={c.id} id={c.id} actions={allowedActions(c, channel)} outcomes={outcomesFor(c, channel)} canUndo={canUndo} invites={d.invites} org={c.org} orgSentToday={d.orgSentToday} companyMax={d.companyMax} />
      )}

      {channel && composed && (
        <Composer
          key={`${c.id}-${composed.key}`}
          id={c.id} channel={channel} to={c.email} confidence={c.email_confidence} linkedinUrl={c.linkedin_url}
          subject={composed.subject} body={composed.body} firstEmail={channel === 'email' && c.status === 'to_contact'}
          canSaveMessage={composed.canSaveMessage}
        />
      )}

      <div className="grid grid-cols-[7rem_1fr] items-center gap-2 border-t border-line pt-4">
        <span className="label">Follow up on</span>
        <FollowUp key={`f${c.id}-${c.follow_up_on ?? ''}`} id={c.id} value={c.follow_up_on} />
      </div>
      <Notes key={`n${c.id}`} id={c.id} value={c.my_notes} />

      <details>
        <summary className="cursor-pointer rounded text-xs font-medium text-muted hover:text-fg">All columns from “{list.source_sheet}”</summary>
        <dl className="mt-3 space-y-2.5 border-l border-line pl-3">
          {Object.entries(extra).filter(([, v]) => v).map(([k, v]) => (
            <div key={k}><dt className="label">{k}</dt><dd className="whitespace-pre-wrap break-words">{v}</dd></div>
          ))}
        </dl>
      </details>

      <section className="border-t border-line pt-4">
        <h3 className="label mb-2">History</h3>
        <ol className="space-y-1 text-xs">
          {events.map(e => (
            <li key={e.id} className={e.reverted ? 'text-muted line-through' : ''}>
              <span className="mr-1 font-mono tabular-nums text-muted">{e.at.slice(0, 10)}</span> {EVENT_LABEL[e.type] ?? e.type}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
