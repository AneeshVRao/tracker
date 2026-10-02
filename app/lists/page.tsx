import Link from 'next/link';
import { Empty } from '@/app/ui';
import { getDb } from '@/lib/db';
import { listSummaries } from '@/lib/queries';

export default function ListsPage() {
  const lists = listSummaries(getDb());
  return (
    <div className="mx-auto max-w-5xl space-y-4 px-6 py-8">
      <div className="flex items-center gap-2">
        <h1 className="page-title flex-1">Lists</h1>
        <Link href="/import" className="btn">Import workbook</Link>
        {lists.length > 0 && <a href="/api/export" className="btn-primary">Export to Excel</a>}
      </div>
      {!lists.length ? <Empty>Nothing imported yet.</Empty> : (
        <div className="card overflow-x-auto"><table className="w-full min-w-[720px] text-left">
          <thead className="border-b border-line bg-sunken/60"><tr className="[&>th]:whitespace-nowrap">
            <th className="th">List</th><th className="th">Type</th><th className="th hidden xl:table-cell">Source</th>
            <th className="th text-right">Total</th><th className="th text-right">To contact</th><th className="th text-right">Pending</th>
            <th className="th text-right">Talking</th><th className="th text-right">Closed</th><th className="th text-right">Skipped</th>
          </tr></thead>
          <tbody>{lists.map(l => (
            <tr key={l.id} className="border-t border-line tabular-nums first:border-t-0 hover:bg-sunken [&>td]:px-3 [&>td]:py-2.5">
              <td className="min-w-[14rem]"><Link href={`/lists/${l.id}`} className="font-medium hover:text-accent">{l.name}</Link></td>
              <td className="text-muted">{l.kind === 'reference' ? 'Reference' : l.channel === 'email' ? 'Email' : 'LinkedIn'}</td>
              <td className="hidden max-w-60 truncate text-muted xl:table-cell">{l.source_file} › {l.source_sheet}</td>
              <td className="text-right">{l.total}</td>
              {l.kind === 'reference' ? <td colSpan={5} /> : <>
                <td className="text-right">{l.to_contact}</td><td className="text-right">{l.pending}</td><td className="text-right">{l.talking}</td>
                <td className="text-right">{l.closed}</td><td className="text-right">{l.skipped}</td>
              </>}
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}
