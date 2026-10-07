'use client';

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="mx-auto max-w-lg space-y-3 px-6 py-20">
      <h1 className="page-title">This page hit an error</h1>
      <p className="text-muted">
        Nothing was changed. If it keeps happening, check that <code className="font-mono text-xs">data/tracker.db</code> is
        not open in another program, then try again.
      </p>
      {error.digest && <p className="font-mono text-xs text-muted">Reference {error.digest} (see the server terminal)</p>}
      <button className="btn-primary" onClick={() => retry()}>Try again</button>
    </div>
  );
}
