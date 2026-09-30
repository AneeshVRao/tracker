import Link from 'next/link';
import { Empty, StatusChip } from '@/app/ui';
import { getDb } from '@/lib/db';
import { referenceDeadlines } from '@/lib/insights';
import { getSettings } from '@/lib/queries';
import { todayIn } from '@/lib/rules';
import { upcomingDeadlines } from '@/lib/today';

const WINDOWS = [14, 30, 60, 120];

export default async function DeadlinesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const raw = Number([sp.within].flat()[0]);
  const within = WINDOWS.includes(raw) ? raw : 60;
  const db = getDb();
  const today = todayIn(getSettings(db).my_timezone, new Date());
  const contacts = upcomingDeadlines(db, today, within);
  const refs = referenceDeadlines(db, today);
  const tone = (d: number) => (d <= 7 ? 'text-bad' : d <= 21 ? 'text-warn' : 'text-muted');

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <header className="flex flex-wrap items-end gap-3">
        <h1 className="page-title mr-auto">Deadlines</h1>
        <nav aria-label="Window" className="flex gap-1">
          {WINDOWS.map(w => <Link key={w} href={`/deadlines?within=${w}`} className={w === within ? 'btn-primary' : 'btn'} aria-current={w === within ? 'page' : undefined}>{w} days</Link>)}
        </nav>
      </header>

      <section className="space-y-2">
        <h2 className="font-medium">Contacts with a deadline in the next {within} days ({contacts.length})</h2>
        {contacts.length === 0 ? <Empty>No contact deadlines in this window.</Empty> : (
          <div className="card divide-y divide-line">
            {contacts.map(c => (
              <div key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
                <span className={`w-28 font-mono text-xs tabular-nums ${tone(c.days)}`}>{c.next}</span>
                <span className={`w-16 text-xs ${tone(c.days)}`}>{c.days === 0 ? 'today' : `in ${c.days}d`}</span>
                <div className="min-w-0 flex-1">
                  <Link href={`/contacts?open=${c.id}`} className="font-medium hover:text-accent">{c.name}</Link>
                  <div className="truncate text-xs text-muted">{[c.org, c.list_name].filter(Boolean).join(' · ')}</div>
                </div>
                <StatusChip s={c.status} />
              </div>
            ))}
          </div>
        )}
      </section>

      {refs.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">Programmes and reference deadlines</h2>
          <div className="card divide-y divide-line">
            {refs.map(r => (
              <div key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
                <span className={`w-28 font-mono text-xs tabular-nums ${r.days === null ? 'text-muted' : tone(r.days)}`}>{r.next ?? '—'}</span>
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent">{r.name}</a> : r.name}</span>
                  <div className="truncate text-xs text-muted">{[r.org, r.list_name].filter(Boolean).join(' · ')}</div>
                  {r.deadline_text && <div className="text-xs text-muted">{r.deadline_text}</div>}
                </div>
                {r.days !== null && <span className={`text-xs ${tone(r.days)}`}>{r.days === 0 ? 'today' : `in ${r.days}d`}</span>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
