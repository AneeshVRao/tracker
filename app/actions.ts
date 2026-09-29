'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/db';
import { importSheet, previewSheets, type ImportReport, type PreviewTab, type TabConfig } from '@/lib/importer';
import * as q from '@/lib/queries';
import type { Action, Outcome } from '@/lib/rules';
import type { TemplateSet } from '@/lib/template';
import { readWorkbook } from '@/lib/workbook';

const refresh = () => revalidatePath('/', 'layout');
const message = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

export async function actContact(id: number, action: Action, outcome?: Outcome) { q.performAction(getDb(), id, action, outcome); refresh(); }
export async function undoContact(id: number) { const ok = q.undoLast(getDb(), id); refresh(); return ok; }
export async function editContact(id: number, field: q.EditableField, value: string | null) { q.editContact(getDb(), id, field, value); refresh(); }
export async function saveNotes(id: number, text: string) { q.setNotes(getDb(), id, text); }

export async function bulkForm(fd: FormData) {
  const ids = fd.getAll('ids').map(Number).filter(Number.isInteger);
  const date = String(fd.get('date') ?? '');
  if (fd.get('op') === 'followup' && date) q.bulkFollowUp(getDb(), ids, date);
  else q.bulkSkip(getDb(), ids);
  refresh();
}

export async function saveTemplatesForm(fd: FormData) {
  const t: TemplateSet = { subject: '', body: '', followup1: '', followup2: '', after_accept: '' };
  for (const k of Object.keys(t) as (keyof TemplateSet)[]) t[k] = String(fd.get(k) ?? '');
  q.saveTemplates(getDb(), Number(fd.get('id')), t);
  refresh();
}

async function sheetsFrom(fd: FormData) {
  const file = fd.get('file');
  if (!(file instanceof File) || !/\.xlsx$/i.test(file.name)) throw new Error('Choose an .xlsx file');
  return { name: file.name, sheets: await readWorkbook(Buffer.from(await file.arrayBuffer())) };
}

export async function previewWorkbook(fd: FormData): Promise<{ tabs: PreviewTab[] } | { error: string }> {
  try {
    const { name, sheets } = await sheetsFrom(fd);
    return { tabs: previewSheets(getDb(), name, sheets) };
  } catch (e) { return { error: message(e) }; }
}

export async function runImport(fd: FormData): Promise<{ reports: ImportReport[] } | { error: string }> {
  try {
    const { name, sheets } = await sheetsFrom(fd);
    const configs = JSON.parse(String(fd.get('config'))) as TabConfig[];
    const db = getDb();
    const settings = q.getSettings(db);
    const now = new Date();
    const reports = configs.filter(c => c.include).map(cfg => {
      const sheet = sheets.find(s => s.name === cfg.sheet);
      if (!sheet) throw new Error(`Sheet "${cfg.sheet}" not found in ${name}`);
      if (cfg.kind === 'contacts' && !cfg.mapping.name) throw new Error(`"${cfg.sheet}": map the Name column first`);
      return importSheet(db, name, sheet, cfg, { now, settings });
    });
    refresh();
    return { reports };
  } catch (e) { return { error: message(e) }; }
}
