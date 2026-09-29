import Link from 'next/link';
import { bulkForm } from '@/app/actions';
import { Empty, StatusChip } from '@/app/ui';
import { getDb } from '@/lib/db';
import { getContactDetail, listContacts, listHeaders, listSummaries, PAGE_SIZE, type Filters } from '@/lib/queries';
import { STATUS_LABEL, type Status } from '@/lib/rules';
import { ContactPanel } from './ContactPanel';

type SP = Record<string, string | string[] | undefined>;
const num = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : undefined);

export default async function ContactsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const raw = await searchParams;
  const sp = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, (Array.isArray(v) ? v[0] : v) || undefined])) as Record<string, string | undefined>;
  const f: Filters = { list: num(sp.list), status: sp.status, q: sp.q, priority: num(sp.priority), conf: sp.conf, col: sp.col, val: sp.val, sort: sp.sort, page: num(sp.page) ?? 1 };
  const db = getDb();
  const lists = listSummaries(db).filter(l => l.kind === 'contacts');
  if (!lists.length) return <Empty>No contacts yet. <Link href="/import" className="text-accent underline">Import a workbook</Link> to start.</Empty>;

  const { rows, total } = listContacts(db, f);
  const listName = new Map(lists.map(l => [l.id, l.name]));
  const headers = listHeaders(db, f.list);
  const openId = num(sp.open);
  const detail = openId ? getContactDetail(db, openId) : null;
  const href = (p: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...p })) if (v !== undefined && v !== '') u.set(k, String(v));
    return `/contacts?${u}`;
  };
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex h-screen">
      <section className="flex min-w-0 flex-1 flex-col">
        <form action="/contacts" className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <input name="q" defaultValue={sp.q} placeholder="Search name, org, role, message" className="input w-60" />
          <select name="list" defaultValue={sp.list ?? ''} className="input"><option value="">All lists</option>{lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          <select name="status" defaultValue={sp.status ?? ''} className="input">
            <option value="">Any status</option><option value="open">Open</option>
            {(Object.keys(STATUS_LABEL) as Status[]).filter(s => s !== 'reference').map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <select name="priority" defaultValue={sp.priority ?? ''} className="input"><option value="">Any priority</option><option value="3">High</option><option value="2">Medium</option><option value="1">Low</option></select>
          <select name="conf" defaultValue={sp.conf ?? ''} className="input"><option value="">Any email</option><option value="verified">Verified email</option><option value="inferred">Inferred email</option><option value="unknown">Unlabelled email</option><option value="none">No email</option></select>
          <select name="col" defaultValue={sp.col ?? ''} className="input max-w-44"><option value="">Column…</option>{headers.map(h => <option key={h} value={h}>{h}</option>)}</select>
          <input name="val" defaultValue={sp.val} placeholder="contains" className="input w-28" />
          <select name="sort" defaultValue={sp.sort ?? ''} className="input"><option value="">Sheet order</option><option value="priority">Priority</option><option value="name">Name</option><option value="follow">Follow-up date</option><option value="touched">Last touched</option></select>
          <button className="btn">Apply</button>
          <Link href="/contacts" className="text-muted hover:text-fg">Reset</Link>
          <span className="ml-auto text-muted tabular-nums">{total} contacts</span>
        </form>

        <form action={bulkForm} className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-muted">
            <span>Selected:</span>
            <input type="date" name="date" className="input" aria-label="Follow-up date for selected" />
            <button name="op" value="followup" className="btn">Set follow-up</button>
            <button name="op" value="skip" className="btn">Skip</button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-bg text-muted"><tr>
                <th className="w-8 px-3 py-2" /><th className="py-2 font-normal">Name</th><th className="font-normal">Organisation</th>
                <th className="font-normal">List</th><th className="font-normal">Status</th><th className="font-normal">Pri</th><th className="pr-3 font-normal">Follow-up</th>
              </tr></thead>
              <tbody>
                {rows.map(c => (
                  <tr key={c.id} className={`border-t border-line ${c.id === openId ? 'bg-accent/10' : 'hover:bg-line/40'}`}>
                    <td className="px-3"><input type="checkbox" name="ids" value={c.id} aria-label={`Select ${c.name}`} /></td>
                    <td className="py-1.5">
                      <Link href={href({ open: c.id })} scroll={false} className="font-medium hover:text-accent">{c.name}</Link>
                      {c.role && <div className="max-w-80 truncate text-xs text-muted">{c.role}</div>}
                    </td>
                    <td className="max-w-56 truncate">{c.org}</td>
                    <td className="text-muted">{listName.get(c.list_id)}</td>
                    <td><StatusChip s={c.status} /></td>
                    <td className="text-muted">{['', 'L', 'M', 'H'][c.priority]}</td>
                    <td className="pr-3 tabular-nums text-muted">{c.follow_up_on ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && <Empty>No contacts match these filters.</Empty>}
          </div>
          {pages > 1 && (
            <div className="flex items-center gap-3 border-t border-line px-3 py-2 text-muted">
              {f.page! > 1 && <Link href={href({ page: f.page! - 1 })}>← Prev</Link>}
              <span>Page {f.page} of {pages}</span>
              {f.page! < pages && <Link href={href({ page: f.page! + 1 })}>Next →</Link>}
            </div>
          )}
        </form>
      </section>

      {detail && (
        <aside className="w-[520px] shrink-0 overflow-y-auto border-l border-line bg-panel">
          <ContactPanel d={detail} closeHref={href({ open: undefined })} />
        </aside>
      )}
    </div>
  );
}
