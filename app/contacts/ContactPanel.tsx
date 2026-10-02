import { XIcon } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { StatusChip } from '@/app/ui';
import type { ContactDetail } from '@/lib/queries';
import { formatIn, inWindow, nextSlot, tzFor } from '@/lib/besttime';
import { allowedActions, nextDeadline, outcomesFor, OUTCOME_LABEL, STATUS_LABEL, todayIn, type Settings } from '@/lib/rules';
import { composeFor, meFrom } from '@/lib/template';
import { Composer } from './Composer';
import { ContactActions } from './ContactActions';
import { DeadlineEditor } from './DeadlineEditor';
import { FollowUp, Notes } from './Fields';
import { TzOverride } from './TzOverride';

const EVENT_LABEL: Record<string, string> = {
  imported: 'Imported', sent: 'Sent', skipped: 'Skipped', accepted: 'Accepted', messaged: 'Messaged', nudged: 'Nudged',
  replied: 'Replied', status: 'Status changed', closed: 'Closed', reopened: 'Reopened', edited: 'Edited', note: 'Note',
};

// An invalid stored tz makes the Intl helpers throw; treat that as an unknown zone rather than crash the panel.
function bestTime(country: string | null, override: string | null, now: Date, w: Settings['send_window']) {
  try {
    const tz = tzFor(country, override);
    if (!tz) return null;
    const good = inWindow(now, tz, w);
    return { tz, good, slot: good ? null : nextSlot(now, tz, w), here: formatIn(now, tz) };
  } catch { return null; }
}

export function ContactPanel({ d, closeHref, settings, now }: { d: ContactDetail; closeHref: string; settings: Settings; now: Date }) {
  const { contact: c, list, events, alsoIn, canUndo } = d;
  const extra = JSON.parse(c.extra) as Record<string, string>;
  const channel = list.channel;
  const composed = composeFor(c, list, meFrom(settings));
  const today = todayIn(settings.my_timezone, now);
  const dates = JSON.parse(c.deadline_dates) as string[];
  const next = nextDeadline(dates, c.deadline_manual, today);
  const days = next ? Math.round((Date.parse(next) - Date.parse(today)) / 86400000) : 0;
  const bt = channel === 'email' ? bestTime(c.country, c.tz, now, settings.send_window) : null;
  const contacted = alsoIn.filter(a => !['to_contact', 'skipped', 'reference'].includes(a.status));

  return (
    <div className="space-y-5 p-5 text-[13px]">
      <header className="space-y-1">
        <div className="flex items-start gap-2">
          <h2 className="flex-1 text-[21px] leading-tight font-semibold tracking-[-0.02em]">{c.name}</h2>
          <Link href={closeHref} scroll={false} className="-mr-1 grid size-7 place-items-center rounded-full text-muted hover:bg-sunken hover:text-fg" aria-label="Close panel"><XIcon size={16} aria-hidden /></Link>
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

      {contacted.length > 0 && (
        <p role="alert" className="rounded-md border border-warn/40 bg-warn/10 px-2 py-1.5 text-xs text-warn">Already contacted via {contacted.map(a => `${a.list} (${STATUS_LABEL[a.status]})`).join(', ')}. Don&apos;t message the same person twice.</p>
      )}

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
      <section className="space-y-2 border-t border-line pt-4">
        <h3 className="label">Deadline</h3>
        {next ? <p className="text-xs">Next: <span className="font-medium">{next}</span> · in {days}d</p> : <p className="text-xs text-muted">No upcoming deadline.</p>}
        {c.deadline_manual && c.deadline_manual < today && <p className="text-xs text-muted">Your date {c.deadline_manual} has passed — showing sheet dates.</p>}
        {c.deadline_text && <p className="text-xs text-muted">Sheet: {c.deadline_text}</p>}
        <DeadlineEditor key={`d${c.id}-${c.deadline_manual ?? ''}`} id={c.id} dates={dates} manual={c.deadline_manual} today={today} />
        {channel === 'email' && (
          <>
            <h3 className="label pt-2">Best time to send</h3>
            {bt ? (
              <>
                <p className="text-xs">Their time: {bt.here} ({bt.tz})</p>
                {bt.good
                  ? <p className="text-xs text-good">Good time to send now.</p>
                  : <p className="text-xs">Next good slot: {formatIn(bt.slot!, bt.tz)} their time = {formatIn(bt.slot!, settings.my_timezone)} yours. Use Gmail&apos;s Schedule send.</p>}
              </>
            ) : <p className="text-xs text-muted">Unknown time zone{c.country ? ` for "${c.country}"` : ''}.</p>}
            <div className="text-xs">Override: <TzOverride key={`t${c.id}-${c.tz ?? ''}`} id={c.id} value={c.tz} /></div>
          </>
        )}
      </section>
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
