import { Empty } from '@/app/ui';
import { getDb } from '@/lib/db';
import { introGroups } from '@/lib/insights';
import { IntroCard } from './IntroCard';

export default function IntrosPage() {
  const groups = introGroups(getDb());
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="page-title">Warm intros</h1>
      <p className="text-muted">Your 2nd-degree connections grouped by the mutual who could introduce you. One message to a mutual can open several doors. Only contacts you haven&apos;t heard back from are listed.</p>
      {groups.length === 0 ? <Empty>No mutual connections recorded yet. They come from a &ldquo;Degree / Mutuals&rdquo; column like &ldquo;2nd - mutual: Name&rdquo;.</Empty>
        : groups.map(g => (
          <IntroCard key={g.mutual} mutual={g.mutual}
            contacts={g.contacts.map(c => ({ id: c.id, name: c.name, org: c.org, role: c.role, list_name: c.list_name, asked_at: c.asked_at, status: c.status }))} />
        ))}
    </div>
  );
}
