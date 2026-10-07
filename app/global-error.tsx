'use client';

// Replaces the root layout when it fails (it reads the database), so it brings its own document and plain styles.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#fffdf9', color: '#1c1b17', maxWidth: 520, margin: '15vh auto', padding: '0 24px', lineHeight: 1.5 }}>
        <title>Outreach Tracker: database error</title>
        <h1 style={{ fontSize: 24, letterSpacing: '-0.02em' }}>The tracker could not open its database</h1>
        <p>It reads <code>data/tracker.db</code> in the Tracker folder. Close any program that has the file open (a SQLite viewer, a sync tool) and try again. Nothing is deleted.</p>
        {error.digest && <p style={{ fontSize: 12, color: '#66645b' }}>Reference {error.digest} (see the server terminal)</p>}
        <button onClick={() => retry()} style={{ background: '#0f766e', color: '#fff', border: 0, borderRadius: 999, padding: '8px 16px', fontWeight: 600, cursor: 'pointer' }}>Try again</button>
      </body>
    </html>
  );
}
