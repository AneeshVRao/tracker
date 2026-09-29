import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import Link from 'next/link';
import './globals.css';

const sans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

export const dynamic = 'force-dynamic'; // every page reads the live DB
export const metadata: Metadata = { title: 'Outreach Tracker' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="flex min-h-screen font-sans antialiased">
        <nav className="sticky top-0 flex h-screen w-40 shrink-0 flex-col gap-0.5 border-r border-line bg-panel p-3">
          <span className="mb-4 px-2 text-[13px] font-semibold tracking-tight">Outreach</span>
          <Link href="/contacts" className="nav">Contacts</Link>
          <Link href="/lists" className="nav">Lists</Link>
          <Link href="/import" className="nav">Import</Link>
        </nav>
        <main className="min-w-0 flex-1">{children}</main>
      </body>
    </html>
  );
}
