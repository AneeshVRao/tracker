import type { Metadata } from 'next';
import { Figtree, JetBrains_Mono } from 'next/font/google';
import { getDb } from '@/lib/db';
import { getSettings } from '@/lib/queries';
import { todayIn } from '@/lib/rules';
import { formatRange } from '@/lib/template';
import { navCounts } from '@/lib/today';
import { CommandPalette } from './CommandPalette';
import { Sidebar } from './Sidebar';
import './globals.css';

const sans = Figtree({ subsets: ['latin'], variable: '--font-figtree' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' });

export const dynamic = 'force-dynamic'; // every page reads the live DB
export const metadata: Metadata = { title: { default: 'Outreach', template: '%s · Outreach' } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const db = getDb();
  const s = getSettings(db);
  const counts = navCounts(db, todayIn(s.my_timezone, new Date()));
  // "Apr 20 to Jul 20, 2027" when both dates share a year
  const [from, to] = formatRange(s.avail_from, s.avail_to).split(' – ');
  const dates = !to ? '' : from.slice(-4) === to.slice(-4) ? `${from.slice(0, -6)} to ${to}` : `${from} to ${to}`;
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="flex min-h-screen font-sans antialiased">
        <Sidebar counts={counts} name={s.my_name} dates={dates} />
        <main className="min-w-0 flex-1">{children}</main>
        <CommandPalette />
      </body>
    </html>
  );
}
