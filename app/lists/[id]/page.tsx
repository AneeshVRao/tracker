import Link from 'next/link';
import { notFound } from 'next/navigation';
import { saveTemplatesForm } from '@/app/actions';
import { getDb } from '@/lib/db';
import { FIELD_LABEL, FIELDS, type Mapping } from '@/lib/mapping';
import { getList, referenceRows } from '@/lib/queries';
import { TEMPLATE_FIELDS, type TemplateSet } from '@/lib/template';

export default async function ListPage({ params }: { params: Promise<{ id: string }> }) {
  const db = getDb();
  const list = getList(db, Number((await params).id));
  if (!list) notFound();
  const t = JSON.parse(list.templates) as TemplateSet;
  const headers = JSON.parse(list.headers) as string[];
  const mapping = JSON.parse(list.mapping) as Mapping;

  return (
    <div className={`mx-auto space-y-8 px-6 py-8 ${list.kind === 'reference' ? 'max-w-7xl' : 'max-w-4xl'}`}>
      <header className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="page-title">{list.name}</h1>
          <p className="mt-0.5 text-muted">{list.source_file} › {list.source_sheet} · {list.kind === 'reference' ? 'Reference list' : list.channel === 'email' ? 'Email outreach' : 'LinkedIn outreach'}</p>
        </div>
        {list.kind === 'contacts' && <Link href={`/contacts?list=${list.id}`} className="btn">View contacts</Link>}
      </header>

      {list.kind === 'reference' && (() => {
        const rows = referenceRows(db, list.id);
        return (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead className="border-b border-line bg-sunken/60"><tr>{headers.map(h => <th key={h} className="th whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody>{rows.map(r => (
                <tr key={r.id} className="border-t border-line align-top first:border-t-0 hover:bg-sunken [&>td]:px-3 [&>td]:py-2">
                  {headers.map(h => {
                    const v = r.cells[h] ?? '';
                    return <td key={h} className="max-w-72 text-[13px]">{/^https?:\/\//i.test(v) ? <a href={v} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{v.replace(/^https?:\/\/(www\.)?/, '')}</a> : v}</td>;
                  })}
                </tr>
              ))}</tbody>
            </table>
          </div>
        );
      })()}

      {list.channel && (
        <form action={saveTemplatesForm} className="space-y-4">
          <input type="hidden" name="id" value={list.id} />
          {/* keep templates of the other channel's fields as hidden inputs so saving never wipes them */}
          {(['subject', 'body', 'followup1', 'followup2', 'after_accept'] as const).filter(k => !TEMPLATE_FIELDS[list.channel!].some(([f]) => f === k)).map(k => <input key={k} type="hidden" name={k} value={t[k] ?? ''} />)}
          {TEMPLATE_FIELDS[list.channel].map(([k, label]) => (
            <label key={k} className="block space-y-1">
              <span className="label">{label}</span>
              <textarea name={k} defaultValue={t[k] ?? ''} rows={k === 'subject' ? 1 : 9} className="input w-full text-[13.5px] leading-relaxed" />
            </label>
          ))}
          <button className="btn-primary">Save templates</button>
        </form>
      )}

      {list.channel && <section className="space-y-2 border-t border-line pt-6">
        <h2 className="font-semibold tracking-tight">Placeholders</h2>
        <p className="text-muted">{'{{first_name}} {{last_name}} {{name}} {{org}} {{role}} {{message}} {{my_name}} {{my_first_name}} {{my_intro}} {{my_dates}}'} · any column as {'{{col:Column name}}'}. Text in [[double brackets]] blocks copying until you replace it.</p>
        <div className="flex flex-wrap gap-1.5">{headers.map(h => <code key={h} className="rounded border border-line bg-sunken px-1.5 py-0.5 font-mono text-xs">{`{{col:${h}}}`}</code>)}</div>
      </section>}

      <section className="space-y-2 border-t border-line pt-6">
        <h2 className="font-semibold tracking-tight">Column mapping</h2>
        <p className="text-muted">To change it, import the file again and adjust the mapping there.</p>
        <dl className="grid grid-cols-[10rem_1fr] gap-y-1.5">
          {FIELDS.filter(f => mapping[f]).map(f => [<dt key={`${f}t`} className="text-muted">{FIELD_LABEL[f]}</dt>, <dd key={`${f}d`}>{mapping[f]}</dd>])}
          {mapping.exclude && [<dt key="xt" className="text-muted">Skip rule</dt>, <dd key="xd">{mapping.exclude.column} contains “{mapping.exclude.contains}”</dd>]}
        </dl>
      </section>
    </div>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return { title: getList(getDb(), Number((await params).id))?.name ?? 'List' };
}
