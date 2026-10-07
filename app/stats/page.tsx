import Link from 'next/link';
import { Empty } from '@/app/ui';
import { getDb } from '@/lib/db';
import { statsBy } from '@/lib/insights';
import { listHeaders } from '@/lib/queries';

const DIMS: [string, string][] = [['all', 'Overall'], ['list', 'List'], ['project', 'Project mentioned'], ['priority', 'Priority'], ['degree', 'Connection degree'], ['country', 'Country']];
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');

export default async function StatsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const db = getDb();
  const headers = listHeaders(db);
  const asked = [sp.dim].flat()[0] ?? 'list';
  const dim = DIMS.some(([k]) => k === asked) || (asked.startsWith('col:') && headers.includes(asked.slice(4))) ? asked : 'list';
  const rows = statsBy(db, dim);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <header className="flex flex-wrap items-end gap-3">
        <h1 className="page-title mr-auto">What gets <em>replies</em></h1>
        <form action="/stats" className="flex items-center gap-1.5">
          <select name="dim" defaultValue={dim} className="input" aria-label="Group by">
            {DIMS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            <optgroup label="Sheet column">{headers.map(h => <option key={h} value={`col:${h}`}>{h}</option>)}</optgroup>
          </select>
          <button className="btn">Group</button>
        </form>
      </header>
      <p className="max-w-[65ch] text-muted">Counts only contacts you marked sent. Accepted applies to LinkedIn invites. Groups with fewer than 5 sends are greyed out: too few to trust.</p>
      {rows.length === 0 ? <Empty>No sends yet. Stats appear once you start marking messages sent. <Link href="/session" className="text-accent underline">Start a session</Link>.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead className="border-b border-line bg-sunken/60"><tr>
              <th className="th">Group</th><th className="th text-right">Sent</th><th className="th text-right">Accepted</th>
              <th className="th text-right">Replied</th><th className="th text-right">Reply rate</th><th className="th text-right">Median days to reply</th>
            </tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.key} className={`border-t border-line tabular-nums first:border-t-0 hover:bg-sunken [&>td]:py-2 ${r.sent < 5 ? 'text-muted' : ''}`}>
                <td className="px-3 py-1.5">{r.key}{r.sent < 5 && <span className="ml-2 rounded-full border border-line px-1.5 py-px text-xs">small sample</span>}</td>
                <td className="px-3 text-right">{r.sent}</td>
                <td className="px-3 text-right">{r.linkedinSent ? `${r.accepted} (${pct(r.accepted, r.linkedinSent)})` : '—'}</td>
                <td className="px-3 text-right">{r.replied}</td>
                <td className="px-3 text-right">{pct(r.replied, r.sent)}</td>
                <td className="px-3 text-right">{r.medianDays ?? '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export const metadata = { title: 'What gets replies' };
