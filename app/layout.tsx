import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const dynamic = 'force-dynamic'; // every page reads the live DB
export const metadata: Metadata = { title: 'Outreach Tracker' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen antialiased">
        <nav className="flex w-44 shrink-0 flex-col gap-0.5 border-r border-line p-3">
          <span className="mb-4 px-2 font-semibold">Outreach</span>
          <Link href="/contacts" className="nav">Contacts</Link>
          <Link href="/lists" className="nav">Lists</Link>
          <Link href="/import" className="nav">Import</Link>
        </nav>
        <main className="min-w-0 flex-1">{children}</main>
      </body>
    </html>
  );
}
