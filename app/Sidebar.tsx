'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { openPalette } from './CommandPalette';
import {
  AddressBookIcon, MagnifyingGlassIcon, CalendarBlankIcon, ChartBarIcon, FileArrowDownIcon, GearSixIcon, HandshakeIcon, KeyboardIcon, PaperPlaneTiltIcon, StackIcon, SunHorizonIcon, type Icon,
} from '@phosphor-icons/react';

type Counts = { today: number; queue: number; contacts: number; deadlines: number; lists: number };
type Props = { counts: Counts; name: string; dates: string };

const ITEMS: [href: string, label: string, icon: Icon, count?: keyof Counts][] = [
  ['/today', 'Today', SunHorizonIcon, 'today'],
  ['/session', 'Session', KeyboardIcon, 'queue'],
  ['/contacts', 'Contacts', AddressBookIcon, 'contacts'],
  ['/deadlines', 'Deadlines', CalendarBlankIcon, 'deadlines'],
  ['/intros', 'Intros', HandshakeIcon],
  ['/stats', 'Stats', ChartBarIcon],
  ['/lists', 'Lists', StackIcon, 'lists'],
  ['/import', 'Import', FileArrowDownIcon],
  ['/settings', 'Settings', GearSixIcon],
];

export function Sidebar({ counts, name, dates }: Props) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="sticky top-0 flex h-screen w-16 shrink-0 flex-col border-r border-line bg-side px-2 py-4 md:w-60 md:px-3">
      <Link href="/today" className="mb-6 flex items-center gap-2.5 px-2">
        <span className="grid size-8 place-items-center rounded-lg bg-accent text-on-accent">
          <PaperPlaneTiltIcon size={17} weight="fill" aria-hidden />
        </span>
        <span className="hidden text-[16px] leading-none font-semibold tracking-[-0.02em] md:inline">Outreach</span>
      </Link>

      <button type="button" onClick={openPalette} aria-label="Search or jump (Ctrl K)"
        className="mb-3 flex h-9 items-center gap-2.5 rounded-full border border-line bg-panel px-3 text-[13px] text-muted shadow-(--shadow-control) hover:border-fg/25 hover:text-fg">
        <MagnifyingGlassIcon size={16} aria-hidden />
        <span className="hidden md:inline">Search or jump</span>
        <kbd className="kbd ml-auto hidden md:inline-flex">Ctrl K</kbd>
      </button>

      <div className="flex flex-col gap-0.5">
        {ITEMS.map(([href, label, I, count]) => (
          <Link key={href} href={href} className="nav" aria-current={path.startsWith(href) ? 'page' : undefined}>
            <I size={17} weight="regular" aria-hidden />
            <span className="sr-only md:not-sr-only">{label}</span>
            {count && counts[count] > 0 && <span className="nav-count hidden md:inline">{counts[count].toLocaleString('en-IN')}</span>}
          </Link>
        ))}
      </div>

      <Link href="/settings" className="mt-auto flex items-center gap-2.5 rounded-lg border-line px-1.5 py-2 hover:border-fg/25 md:border md:bg-panel md:px-3 md:py-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-[14px] font-semibold text-accent" aria-hidden>
          {(name || '?').charAt(0)}
        </span>
        <span className="sr-only min-w-0 md:not-sr-only md:block">
          <span className="block text-[13px] leading-snug font-semibold">{name || 'Set your name'}</span>
          <span className="block text-xs leading-snug text-muted">{dates ? `Available ${dates}` : 'Set your availability'}</span>
        </span>
      </Link>
    </nav>
  );
}
