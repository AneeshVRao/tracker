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
  const pct = stats.invitesWeek / stats.cap;
  const open = (id: number) => `/contacts?open=${id}`;

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <header className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <h1 className="page-title mr-auto">Today <span className="font-normal text-muted">{today}</span></h1>
        <Stat label="LinkedIn invites this week" value={`${stats.invitesWeek}/${stats.cap}`} tone={pct >= 1 ? 'text-bad' : pct >= 0.8 ? 'text-warn' : ''} />
        <Stat label="Sent today" value={stats.sentToday} />
        <Stat label="Replies this week" value={stats.repliesWeek} />
        <Link href="/session" className="btn-primary">Start session</Link>
      </header>

      {deadlines.length > 0 && (
        <Section title={`Deadlines in the next 21 days (${deadlines.length})`}>
          {deadlines.map(d => (
            <Row key={d.id} href={open(d.id)} name={d.name} sub={[d.org, d.list_name].filter(Boolean).join(' · ')}>
              <span className={`tabular-nums text-xs ${d.days <= 7 ? 'text-bad' : 'text-warn'}`}>{d.next} · {d.days === 0 ? 'today' : `in ${d.days}d`}</span>
              <StatusChip s={d.status} />
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
                <QuickAction id={r.id} action={d.action} outcome={d.outcome} label={d.label} />
              </Row>
            ))}
          </Section>
        );
      })}

      {replies.length > 0 && (
        <Section title={`Replies waiting for you (${replies.length})`}>
          {replies.map(r => (
            <Row key={r.id} href={open(r.id)} name={r.name} sub={[r.org, r.list_name].filter(Boolean).join(' · ')}>
              <QuickAction id={r.id} action="conversation" label="In conversation" />
            </Row>
          ))}
        </Section>
      )}

      <Section title="Next up">
        {nextUp.map(({ l, items, deferred }) => (
          <div key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
            <span className="w-48 font-medium">{l.name}</span>
            <span className="text-xs text-muted">{items.length} ready{deferred ? ` · ${deferred} waiting (company spacing)` : ''}</span>
            <span className="min-w-0 flex-1 truncate text-xs text-muted">{items.slice(0, 5).map(i => i.name).join(', ')}</span>
            {items.length > 0 && <Link href={`/session?lists=${l.id}`} className="btn">Session</Link>}
          </div>
        ))}
      </Section>

      {!deadlines.length && !due.length && !replies.length && <p className="text-muted">No follow-ups due. Start a session to send new messages.</p>}
    </div>
  );
}

function Stat({ label, value, tone = '' }: { label: string; value: string | number; tone?: string }) {
  return <div><div className="label">{label}</div><div className={`text-lg font-semibold tabular-nums ${tone}`}>{value}</div></div>;
}

function Section({ title, extra, children }: { title: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-3"><h2 className="font-medium">{title}</h2><div className="ml-auto">{extra}</div></div>
      <div className="card divide-y divide-line">{children}</div>
    </section>
  );
}

function Row({ href, name, sub, children }: { href: string; name: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <Link href={href} className="font-medium hover:text-accent">{name}</Link>
        <div className="truncate text-xs text-muted">{sub}</div>
      </div>
      {children}
    </div>
  );
}
