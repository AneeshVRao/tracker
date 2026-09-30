import Link from 'next/link';
import { Empty } from '@/app/ui';
import { getDb } from '@/lib/db';
import { getList, getSettings, listSummaries } from '@/lib/queries';
import { composeFor } from '@/lib/template';
import { activityStats, buildQueue, orgsSentToday } from '@/lib/today';
import { Session, type SessionItem } from './Session';

type SP = Record<string, string | string[] | undefined>;

export default async function SessionPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
  const db = getDb();
  const lists = listSummaries(db).filter(l => l.kind === 'contacts');
  if (!lists.length) return <Empty>No lists yet. <Link href="/import" className="text-accent underline">Import a workbook</Link>.</Empty>;
  // checkboxes submit lists=1&lists=3; Today links use lists=1,3 — accept both
  const ids = [sp.lists].flat().filter(Boolean).join(',').split(',').map(Number).filter(id => lists.some(l => l.id === id));
  const n = Math.min(100, Math.max(1, Number(one(sp.n)) || 30));

  if (!ids.length) return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="page-title">Start a session</h1>
      <p className="text-muted">Pick the lists to work through. Contacts are ordered by upcoming deadline, then priority. People at an organisation you already contacted today are held back.</p>
      <form action="/session" className="card space-y-3 p-4">
        <fieldset className="space-y-2">
          <legend className="label mb-1">Lists</legend>
          {lists.map(l => (
            <label key={l.id} className="flex items-center gap-2">
              <input type="checkbox" name="lists" value={l.id} defaultChecked={l.to_contact > 0} />
              <span>{l.name}</span><span className="text-xs text-muted">{l.channel === 'email' ? 'Email' : 'LinkedIn'} · {l.to_contact} to contact</span>
            </label>
          ))}
        </fieldset>
        <label className="flex items-center gap-2">Batch size <input name="n" type="number" min={1} max={100} defaultValue={30} className="input w-20" /></label>
        <button className="btn-primary">Start</button>
      </form>
    </div>
  );

  const now = new Date();
  const cfg = getSettings(db);
  const { items, deferred } = buildQueue(db, ids, now, cfg);
  const listById = new Map(ids.map(id => [id, getList(db, id)!]));
  const batch: SessionItem[] = items.slice(0, n).map(c => {
    const composed = composeFor(c, listById.get(c.list_id)!)!;
    return {
      id: c.id, name: c.name, role: c.role, org: c.org, list_name: c.list_name, channel: c.channel,
      email: c.email, email_confidence: c.email_confidence, linkedin_url: c.linkedin_url,
      next_deadline: c.next_deadline, mutual: c.mutual, priority: c.priority,
      subject: composed.subject, body: composed.body, canSaveMessage: composed.canSaveMessage,
    };
  });
  const stats = activityStats(db, now, cfg);
  return (
    <Session
      key={`${ids.join(',')}-${one(sp.b)}`}
      ids={ids} n={n} initialItems={batch} total={items.length} deferred={deferred}
      orgsToday={Object.fromEntries(orgsSentToday(db, now, cfg))} companyMax={cfg.company_daily_max}
      invites={{ used: stats.invitesWeek, cap: stats.cap }}
    />
  );
}
