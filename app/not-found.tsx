import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg space-y-3 px-6 py-20">
      <h1 className="page-title">Nothing here</h1>
      <p className="text-muted">That page or list does not exist. It may have been a link to a list that was never imported.</p>
      <div className="flex gap-2">
        <Link href="/today" className="btn-primary">Go to Today</Link>
        <Link href="/lists" className="btn">See all lists</Link>
      </div>
    </div>
  );
}

export const metadata = { title: 'Not found' };
