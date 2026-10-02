'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { MagnifyingGlassIcon } from '@phosphor-icons/react';

const COMMANDS: [label: string, href: string, hint: string][] = [
  ['Today', '/today', 'Page'],
  ['Start a session', '/session', 'Action'],
  ['Contacts', '/contacts', 'Page'],
  ['Deadlines', '/deadlines', 'Page'],
  ['Warm intros', '/intros', 'Page'],
  ['What gets replies', '/stats', 'Page'],
  ['Lists', '/lists', 'Page'],
  ['Import a workbook', '/import', 'Action'],
  ['Export everything to Excel', '/api/export', 'Action'],
  ['Settings', '/settings', 'Page'],
];

export const openPalette = () => window.dispatchEvent(new Event('open-palette'));

export function CommandPalette() {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);

  useEffect(() => {
    const open = () => { setQ(''); setSel(0); dialog.current?.showModal(); };
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open(); }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('open-palette', open);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('open-palette', open); };
  }, []);

  const term = q.trim();
  const matches = COMMANDS.filter(([label]) => label.toLowerCase().includes(term.toLowerCase()));
  const items: [string, string, string][] = term ? [...matches, [`Search contacts for “${term}”`, `/contacts?q=${encodeURIComponent(term)}`, 'Search']] : matches;
  const go = (href: string) => {
    dialog.current?.close();
    if (href.startsWith('/api/')) window.location.href = href; else router.push(href);
  };

  return (
    <dialog ref={dialog} aria-label="Command palette"
      className="m-auto mt-[14vh] w-[min(560px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-panel p-0 text-fg shadow-(--shadow-pop) backdrop:bg-fg/25 backdrop:backdrop-blur-[2px]"
      onClick={e => { if (e.target === dialog.current) dialog.current.close(); }}>
      <div className="flex items-center gap-2.5 border-b border-line px-4">
        <MagnifyingGlassIcon size={17} className="text-muted" aria-hidden />
        <input autoFocus value={q} placeholder="Jump to a page or search contacts" aria-label="Command"
          className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
          onChange={e => { setQ(e.target.value); setSel(0); }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, items.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
            else if (e.key === 'Enter' && items[sel]) { e.preventDefault(); go(items[sel][1]); }
          }} />
        <kbd className="kbd">Esc</kbd>
      </div>
      <ul role="listbox" aria-label="Results" className="max-h-80 overflow-y-auto p-1.5">
        {items.map(([label, href, hint], i) => (
          <li key={href} role="option" aria-selected={i === sel}>
            <button type="button" onMouseMove={() => setSel(i)} onClick={() => go(href)}
              className={`flex w-full items-center rounded-md px-3 py-2 text-left text-[13.5px] ${i === sel ? 'bg-accent-soft text-fg' : 'text-fg/85'}`}>
              {label}<span className="ml-auto text-xs text-muted">{hint}</span>
            </button>
          </li>
        ))}
        {!items.length && <li className="px-3 py-6 text-center text-muted">Nothing matches.</li>}
      </ul>
    </dialog>
  );
}
