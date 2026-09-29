'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { previewWorkbook, runImport } from '@/app/actions';
import type { ImportReport, PreviewTab } from '@/lib/importer';
import { FIELD_LABEL, FIELDS, type Field } from '@/lib/mapping';

export function ImportWizard() {
  const [file, setFile] = useState<File | null>(null);
  const [tabs, setTabs] = useState<PreviewTab[]>([]);
  const [reports, setReports] = useState<ImportReport[] | null>(null);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  const pick = (f: File | null) => {
    setFile(f); setTabs([]); setReports(null); setError('');
    if (!f) return;
    const fd = new FormData();
    fd.set('file', f);
    start(async () => {
      const r = await previewWorkbook(fd);
      if ('error' in r) setError(r.error); else setTabs(r.tabs);
    });
  };
  const patch = (i: number, p: Partial<PreviewTab>) => setTabs(ts => ts.map((t, j) => (j === i ? { ...t, ...p } : t)));
  const setField = (i: number, f: Field, col: string) => patch(i, { mapping: { ...tabs[i].mapping, [f]: col || undefined } });
  const submit = () => {
    if (!file) return;
    const fd = new FormData();
    fd.set('file', file);
    fd.set('config', JSON.stringify(tabs));
    start(async () => {
      const r = await runImport(fd);
      if ('error' in r) setError(r.error); else setReports(r.reports);
    });
  };

  if (reports) return (
    <div className="space-y-3">
      <div className="card overflow-x-auto">
      <table className="w-full min-w-[640px] text-left tabular-nums">
        <thead className="border-b border-line bg-sunken/60"><tr>{['List', 'New', 'Updated', 'Unchanged', 'Skipped by rule', 'No name', 'Duplicates in file', 'Also in other lists', 'Not in file'].map(h => <th key={h} className="th">{h}</th>)}</tr></thead>
        <tbody>{reports.map(r => (
          <tr key={r.listId} className="border-t border-line first:border-t-0 [&>td]:px-3 [&>td]:py-2">
            <td className="font-medium">{r.listName}</td><td>{r.inserted}</td><td>{r.updated}</td><td>{r.unchanged}</td>
            <td>{r.skippedByRule}</td><td>{r.noName}</td><td>{r.duplicateInFile}</td><td>{r.crossListDupes}</td><td>{r.missingFromFile}</td>
          </tr>))}
        </tbody>
      </table>
      </div>
      <div className="flex gap-2"><Link href="/contacts" className="btn-primary">Open contacts</Link><button className="btn" onClick={() => pick(null)}>Import another</button></div>
    </div>
  );

  return (
    <div className="space-y-4">
      <label className="block cursor-pointer rounded-lg border border-dashed border-fg/25 bg-panel px-6 py-10 text-center text-muted hover:border-accent hover:text-fg focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30">
        {file ? file.name : 'Drop an .xlsx here or click to choose'}
        <input type="file" accept=".xlsx" className="sr-only" onChange={e => pick(e.target.files?.[0] ?? null)} />
      </label>
      {pending && <p role="status" className="text-muted">Reading…</p>}
      {error && <p role="alert" className="text-bad">{error}</p>}

      {tabs.map((t, i) => (
        <section key={t.sheet} className="card">
          <header className="flex flex-wrap items-center gap-3 px-4 py-2.5 [&:has(+div)]:border-b [&:has(+div)]:border-line">
            <input type="checkbox" checked={t.include} onChange={e => patch(i, { include: e.target.checked })} aria-label={`Import ${t.sheet}`} />
            <span className="font-medium">{t.sheet}</span>
            <span className="text-muted">{t.rowCount} rows</span>
            {t.match && <span className="rounded-full bg-accent/10 px-2 py-px text-xs font-medium text-accent">{t.match === 'file+sheet' ? 'updates existing list' : 'looks like an existing list (file renamed?)'}</span>}
          </header>
          {t.include && (
            <div className="space-y-4 p-4">
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                <label className="label flex items-center gap-2">List name <input className="input" value={t.listName} onChange={e => patch(i, { listName: e.target.value })} /></label>
                <label className="label flex items-center gap-2">Kind
                  <select className="input" value={t.kind} onChange={e => patch(i, { kind: e.target.value as PreviewTab['kind'] })}>
                    <option value="contacts">Contacts</option><option value="reference">Reference (no outreach)</option>
                  </select>
                </label>
                {t.kind === 'contacts' && (
                  <label className="label flex items-center gap-2">Channel
                    <select className="input" value={t.channel} onChange={e => patch(i, { channel: e.target.value as PreviewTab['channel'] })}>
                      <option value="email">Email</option><option value="linkedin">LinkedIn</option>
                    </select>
                  </label>
                )}
              </div>
              {t.missingColumns.length > 0 && <p className="text-warn">Columns from the saved mapping are missing in this file: {t.missingColumns.map(c => (c === 'exclude' ? 'skip rule' : c)).join(', ')}. Re-map them below.</p>}
              <div className="grid grid-cols-1 items-center gap-x-3 gap-y-1.5 border-t border-line pt-4 sm:grid-cols-[10rem_16rem_1fr]">
                {FIELDS.map(f => {
                  const col = t.mapping[f] ?? '';
                  return [
                    <span key={`${f}l`} className="label mt-1.5 sm:mt-0">{FIELD_LABEL[f]}</span>,
                    <select key={`${f}s`} aria-label={FIELD_LABEL[f]} className="input" value={col} onChange={e => setField(i, f, e.target.value)}>
                      <option value="">— none —</option>
                      {t.headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>,
                    <span key={`${f}x`} className="truncate text-xs text-muted">{col ? (t.samples[col] ?? []).join(' · ') : ''}</span>,
                  ];
                })}
              </div>
              {t.kind === 'contacts' && (
                <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
                  <span className="label">Start as Skipped when</span>
                  <select aria-label="Skip rule column" className="input" value={t.mapping.exclude?.column ?? ''} onChange={e => patch(i, { mapping: { ...t.mapping, exclude: e.target.value ? { column: e.target.value, contains: t.mapping.exclude?.contains ?? '' } : undefined } })}>
                    <option value="">— no rule —</option>
                    {t.headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                  {t.mapping.exclude && <>
                    <span className="label">contains</span>
                    <input aria-label="Skip rule text" className="input" value={t.mapping.exclude.contains} onChange={e => patch(i, { mapping: { ...t.mapping, exclude: { column: t.mapping.exclude!.column, contains: e.target.value } } })} />
                  </>}
                </div>
              )}
            </div>
          )}
        </section>
      ))}

      {tabs.some(t => t.include) && <button className="btn-primary" disabled={pending} onClick={submit}>{pending ? 'Importing…' : `Import ${tabs.filter(t => t.include).length} tab(s)`}</button>}
    </div>
  );
}
