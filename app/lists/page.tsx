import Link from 'next/link';
import { Empty } from '@/app/ui';
import { getDb } from '@/lib/db';
import { listSummaries } from '@/lib/queries';

export default function ListsPage() {
  const lists = listSummaries(getDb());
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div className="flex items-center gap-2">
        <h1 className="flex-1 text-lg font-semibold">Lists</h1>
        <Link href="/import" className="btn">Import workbook</Link>
        {lists.length > 0 && <a href="/api/export" className="btn-primary">Export to Excel</a>}
      </div>
      {!lists.length ? <Empty>Nothing imported yet.</Empty> : (
        <table className="w-full text-left">
          <thead className="text-muted"><tr>
            <th className="py-1 font-normal">List</th><th className="font-normal">Type</th><th className="font-normal">Source</th>
            <th className="text-right font-normal">Total</th><th className="text-right font-normal">To contact</th><th className="text-right font-normal">Pending</th>
            <th className="text-right font-normal">Talking</th><th className="text-right font-normal">Closed</th><th className="text-right font-normal">Skipped</th>
          </tr></thead>
          <tbody>{lists.map(l => (
            <tr key={l.id} className="border-t border-line tabular-nums">
              <td className="py-1.5"><Link href={`/lists/${l.id}`} className="font-medium hover:text-accent">{l.name}</Link></td>
              <td className="text-muted">{l.kind === 'reference' ? 'Reference' : l.channel === 'email' ? 'Email' : 'LinkedIn'}</td>
              <td className="max-w-60 truncate text-muted">{l.source_file} › {l.source_sheet}</td>
              <td className="text-right">{l.total}</td>
              {l.kind === 'reference' ? <td colSpan={5} /> : <>
                <td className="text-right">{l.to_contact}</td><td className="text-right">{l.pending}</td><td className="text-right">{l.talking}</td>
                <td className="text-right">{l.closed}</td><td className="text-right">{l.skipped}</td>
              </>}
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}
