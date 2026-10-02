import Link from 'next/link';
import { closeStaleForm } from '@/app/actions';
import { Empty, StatusChip } from '@/app/ui';
import { getDb } from '@/lib/db';
import { getSettings, listSummaries } from '@/lib/queries';
import { todayIn, type Action, type Outcome } from '@/lib/rules';
import { activityStats, buildQueue, dueFollowUps, repliesWaiting, upcomingDeadlines, type DueKind } from '@/lib/today';
import { QuickAction } from './QuickAction';

const DUE: Record<DueKind, { title: string; action: Action; outcome?: Outcome; label: string }> = {
  nudge: { title: 'Email nudges due', action: 'nudged', label: 'Nudge sent' },
  close_stale: { title: 'No reply after two nudges', action: 'close', outcome: 'no_reply', label: 'Close' },
  message_after_accept: { title: 'Accepted: send a message', action: 'messaged', label: 'Message sent' },
  withdraw: { title: 'Invites pending too long: withdraw', action: 'close', outcome: 'withdrawn', label: 'Withdrawn' },
  check_in: { title: 'Check in', action: 'checked_in', label: 'Checked in' },
};
const ORDER: DueKind[] = ['message_after_accept', 'nudge', 'check_in', 'withdraw', 'close_stale'];

export default function TodayPage() {
  const db = getDb();
  const now = new Date();
  const cfg = getSettings(db);
  const today = todayIn(cfg.my_timezone, now);
  const lists = listSummaries(db).filter(l => l.kind === 'contacts');
  if (!lists.length) return <Empty>Nothing to do yet. <Link href="/import" className="text-accent underline">Import a workbook</Link> to start.</Empty>;

  const stats = activityStats(db, now, cfg);
  const deadlines = upcomingDeadlines(db, today);
  const due = dueFollowUps(db, today);
  const replies = repliesWaiting(db);
  const nextUp = lists.map(l => ({ l, ...buildQueue(db, [l.id], now, cfg) }));
  const pct = stats.cap > 0 ? stats.invitesWeek / stats.cap : 0;
  const open = (id: number) => `/contacts?open=${id}`;
  const ready = nextUp.reduce((n, x) => n + x.items.length, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-8 md:py-7">
      <header className="card grid items-end gap-5 bg-sunken/70 px-5 py-5 md:grid-cols-[1fr_auto] md:px-7 md:py-6">
        <div>
          <h1 className="page-title">Today, <em>{new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(today))}</em></h1>
          <p className="mt-2 max-w-[60ch] text-[14px] text-muted">
            {ready.toLocaleString('en-IN')} people ready across {nextUp.length} lists. {due.length ? `${due.length} follow-ups due.` : 'No follow-ups due.'}{replies.length ? ` ${replies.length} replies waiting.` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/contacts" className="btn">Browse contacts</Link>
          <Link href="/session" className="btn-primary">Start session</Link>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Sent today" value={stats.sentToday} note="email and LinkedIn" />
        <Stat label="LinkedIn invites" value={`${stats.invitesWeek}/${stats.cap}`} note="rolling 7 days" tone={pct >= 1 ? 'text-bad' : pct >= 0.8 ? 'text-warn' : ''} />
        <Stat label="Replies this week" value={stats.repliesWeek} note="across all lists" />
        <Stat label="Follow-ups due" value={due.length} note={due.length ? 'listed below' : 'nothing waiting'} />
      </div>

      {deadlines.length > 0 && (
        <Section title={`Deadlines in the next 21 days (${deadlines.length})`}>
          {deadlines.map(d => (
            <Row key={d.id} href={open(d.id)} name={d.name} sub={[d.org, d.list_name].filter(Boolean).join(' · ')}>
              <span className={`tabular-nums text-xs ${d.days <= 7 ? 'text-bad' : 'text-warn'}`}>{d.next} · {d.days === 0 ? 'today' : `in ${d.days}d`}</span>
              <StatusChip s={d.status} />
              <Link href={open(d.id)} className="btn" aria-label={`Compose to ${d.name}`}>Compose</Link>
            </Row>
          ))}
        </Section>
      )}

      {ORDER.map(kind => {
        const rows = due.filter(r => r.due === kind);
        if (!rows.length) return null;
        const d = DUE[kind];
        return (
          <Section key={kind} title={`${d.title} (${rows.length})`} extra={kind === 'close_stale' && (
            <form action={closeStaleForm}><button className="btn">Close all {rows.length} as no reply</button></form>
          )}>
            {rows.map(r => (
              <Row key={r.id} href={open(r.id)} name={r.name} sub={[r.org, r.list_name].filter(Boolean).join(' · ')}>
                <span className="tabular-nums text-xs text-muted">due {r.follow_up_on}</span>
                <QuickAction name={r.name} id={r.id} action={d.action} outcome={d.outcome} label={d.label} />
              </Row>
            ))}
          </Section>
        );
      })}

      {replies.length > 0 && (
        <Section title={`Replies waiting for you (${replies.length})`}>
          {replies.map(r => (
            <Row key={r.id} href={open(r.id)} name={r.name} sub={[r.org, r.list_name].filter(Boolean).join(' · ')}>
              <QuickAction name={r.name} id={r.id} action="conversation" label="In conversation" />
            </Row>
          ))}
        </Section>
      )}

      <Section title="Next up">
        {nextUp.map(({ l, items, deferred }) => (
          <div key={l.id} className="row py-3">
            <span className="min-w-0 flex-1 truncate font-medium md:w-56 md:flex-none">{l.name}</span>
            <span className="text-xs text-muted md:w-24"><span className="font-mono text-fg">{items.length}</span> ready{deferred ? ` · ${deferred} waiting (company spacing)` : ''}</span>
            <span className="order-last min-w-0 basis-full truncate text-xs text-muted md:order-none md:basis-0 md:flex-1">{items.slice(0, 10).map(i => i.name).join(', ')}</span>
            {items.length > 0 && <Link href={`/session?lists=${l.id}`} className="btn md:ml-auto">Session</Link>}
          </div>
        ))}
      </Section>

    </div>
  );
}

function Stat({ label, value, note, tone = '' }: { label: string; value: string | number; note: string; tone?: string }) {
  return (
    <div className="card px-4 py-3">
      <div className="label">{label}</div>
      <div className={`mt-1.5 text-[28px] leading-none font-semibold tracking-[-0.03em] tabular-nums ${tone || (value === 0 ? 'text-muted' : '')}`}>{value}</div>
      <div className="mt-1.5 text-xs text-muted">{note}</div>
    </div>
  );
}

function Section({ title, extra, children }: { title: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-3"><h2 className="section-title">{title}</h2><div className="ml-auto">{extra}</div></div>
      <div className="card divide-y divide-line overflow-hidden">{children}</div>
    </section>
  );
}

function Row({ href, name, sub, children }: { href: string; name: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="row">
      <div className="min-w-0 flex-1">
        <Link href={href} className="font-medium hover:text-accent">{name}</Link>
        <div className="truncate text-xs text-muted">{sub}</div>
      </div>
      {children}
    </div>
  );
}
