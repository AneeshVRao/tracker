import Link from 'next/link';
import { bulkForm } from '@/app/actions';
import { Empty, StatusChip } from '@/app/ui';
import { getDb } from '@/lib/db';
import { getContactDetail, getSettings, listContacts, listHeaders, listSummaries, PAGE_SIZE, type Filters } from '@/lib/queries';
import { STATUS_LABEL, type Status } from '@/lib/rules';
import { ContactPanel } from './ContactPanel';

type SP = Record<string, string | string[] | undefined>;
const num = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : undefined);

export default async function ContactsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const raw = await searchParams;
  const sp = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, (Array.isArray(v) ? v[0] : v) || undefined])) as Record<string, string | undefined>;
  const f: Filters = { list: num(sp.list), status: sp.status, q: sp.q, priority: num(sp.priority), conf: sp.conf, col: sp.col, val: sp.val, sort: sp.sort, within: num(sp.within), page: num(sp.page) ?? 1 };
  const db = getDb();
  const now = new Date();
  const lists = listSummaries(db).filter(l => l.kind === 'contacts');
  if (!lists.length) return <Empty>No contacts yet. <Link href="/import" className="text-accent underline">Import a workbook</Link> to start.</Empty>;

  const { rows, total } = listContacts(db, f, now);
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
    <div className="flex min-h-screen flex-col xl:h-screen xl:flex-row">
      <section className="flex min-w-0 flex-1 flex-col xl:min-h-0">
        <form action="/contacts" className="flex flex-wrap items-center gap-1.5 border-b border-line bg-panel px-3 py-2.5">
          <input name="q" aria-label="Search" defaultValue={sp.q} placeholder="Search name, org, role, message" className="input w-64" />
          <select name="list" aria-label="List" defaultValue={sp.list ?? ''} className="input"><option value="">All lists</option>{lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          <select name="status" aria-label="Status" defaultValue={sp.status ?? ''} className="input">
            <option value="">Any status</option><option value="open">Open</option>
            {(Object.keys(STATUS_LABEL) as Status[]).filter(s => s !== 'reference').map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <select name="priority" aria-label="Priority" defaultValue={sp.priority ?? ''} className="input"><option value="">Any priority</option><option value="3">High</option><option value="2">Medium</option><option value="1">Low</option></select>
          <select name="conf" aria-label="Email confidence" defaultValue={sp.conf ?? ''} className="input"><option value="">Any email</option><option value="verified">Verified email</option><option value="inferred">Inferred email</option><option value="unknown">Unlabelled email</option><option value="none">No email</option></select>
          <select name="within" defaultValue={sp.within ?? ''} className="input" aria-label="Deadline within"><option value="">Any deadline</option><option value="7">Deadline ≤ 7 days</option><option value="21">Deadline ≤ 21 days</option><option value="60">Deadline ≤ 60 days</option></select>
          <select name="col" aria-label="Column" defaultValue={sp.col ?? ''} className="input max-w-44"><option value="">Column…</option>{headers.map(h => <option key={h} value={h}>{h}</option>)}</select>
          <input name="val" aria-label="Column contains" defaultValue={sp.val} placeholder="contains" className="input w-28" />
          <select name="sort" aria-label="Sort" defaultValue={sp.sort ?? ''} className="input"><option value="">Sheet order</option><option value="priority">Priority</option><option value="name">Name</option><option value="follow">Follow-up date</option><option value="touched">Last touched</option></select>
          <button className="btn">Apply</button>
          <Link href="/contacts" className="rounded px-1.5 py-1 text-muted hover:text-fg">Reset</Link>
          <span className="ml-auto text-xs tabular-nums text-muted">{total} contacts</span>
        </form>

        <form action={bulkForm} className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-sunken/60 px-3 py-1.5 text-xs text-muted">
            <span className="mr-1 font-medium">Selected</span>
            <input type="date" name="date" className="input" aria-label="Follow-up date for selected" />
            <button name="op" value="followup" className="btn">Set follow-up</button>
            <button name="op" value="skip" className="btn">Skip</button>
          </div>
          <div className="max-h-[70vh] min-h-0 flex-1 overflow-auto xl:max-h-none">
            <table className="w-full min-w-[640px] text-left">
              <thead className="sticky top-0 z-10 border-b border-line bg-bg"><tr>
                <th className="w-8 px-3 py-1.5" /><th className="th !px-0">Name</th><th className="th !px-0">Organisation</th>
                <th className="th !px-0">List</th><th className="th !px-0">Status</th><th className="th !px-0">Pri</th><th className="th !pl-0">Follow-up</th>
              </tr></thead>
              <tbody>
                {rows.map(c => (
                  <tr key={c.id} className={`border-b border-line/70 ${c.id === openId ? 'bg-accent/10 shadow-[inset_2px_0_0_var(--color-accent)]' : 'hover:bg-sunken'}`}>
                    <td className="px-3 align-middle"><input type="checkbox" name="ids" value={c.id} aria-label={`Select ${c.name}`} /></td>
                    <td className="py-1.5 pr-3">
                      <Link href={href({ open: c.id })} scroll={false} className="font-medium hover:text-accent">{c.name}</Link>
                      {c.role && <div className="max-w-80 truncate text-xs text-muted">{c.role}</div>}
                    </td>
                    <td className="max-w-56 truncate pr-3">{c.org}</td>
                    <td className="pr-3 text-muted">{listName.get(c.list_id)}</td>
                    <td className="pr-3"><StatusChip s={c.status} /></td>
                    <td className="pr-3 text-muted">{['', 'L', 'M', 'H'][c.priority]}</td>
                    <td className="pr-3 tabular-nums text-muted">{c.follow_up_on ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && <Empty>No contacts match these filters.</Empty>}
          </div>
          {pages > 1 && (
            <div className="flex items-center gap-3 border-t border-line bg-panel px-3 py-2 text-xs text-muted [&_a]:rounded [&_a]:px-1 [&_a]:text-fg [&_a]:hover:text-accent">
              {f.page! > 1 && <Link href={href({ page: f.page! - 1 })}>← Prev</Link>}
              <span>Page {f.page} of {pages}</span>
              {f.page! < pages && <Link href={href({ page: f.page! + 1 })}>Next →</Link>}
            </div>
          )}
        </form>
      </section>

      {detail && (
        <aside className="order-first w-full shrink-0 border-b border-line bg-panel xl:order-none xl:w-[520px] xl:overflow-y-auto xl:border-b-0 xl:border-l">
          <ContactPanel d={detail} closeHref={href({ open: undefined })} settings={getSettings(db)} now={now} />
        </aside>
      )}
    </div>
  );
}
