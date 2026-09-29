import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default function Home() {
  const { v } = getDb().prepare('SELECT sqlite_version() AS v').get() as { v: string };
  return <p>SQLite {v}</p>;
}
