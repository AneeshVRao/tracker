'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/db';
import { importSheet, previewSheets, type ImportReport, type PreviewTab, type TabConfig } from '@/lib/importer';
import * as q from '@/lib/queries';
import type { Action, EventType, Outcome } from '@/lib/rules';
import type { TemplateSet } from '@/lib/template';
import { readWorkbook } from '@/lib/workbook';

const refresh = () => revalidatePath('/', 'layout');
const message = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

export type ActResult = { ok: true } | { ok: false; limit: { used: number; cap: number } } | { ok: false; error: string };

export async function actContact(id: number, action: Action, outcome?: Outcome, override = false): Promise<ActResult> {
  try {
    q.performAction(getDb(), id, action, outcome, new Date(), { override: override === true });
    return { ok: true };
  } catch (e) {
    if (e instanceof q.LimitError) return { ok: false, limit: { used: e.used, cap: e.cap } };
    return { ok: false, error: message(e) };
  } finally { refresh(); }
}

export async function closeStaleForm() { q.closeStale(getDb()); refresh(); }
export async function undoContact(id: number, only?: EventType[]) {
  if (only !== undefined && !(Array.isArray(only) && only.every(t => t === 'sent' || t === 'skipped'))) throw new Error('Invalid undo filter');
  const ok = q.undoLast(getDb(), id, only); refresh(); return ok;
}
export async function editContact(id: number, field: q.EditableField, value: string | null) { q.editContact(getDb(), id, field, value); refresh(); }
export async function saveNotes(id: number, text: string) { q.setNotes(getDb(), id, text); }

export async function bulkForm(fd: FormData) {
  const ids = fd.getAll('ids').map(Number).filter(Number.isInteger);
  const date = String(fd.get('date') ?? '');
  const op = fd.get('op');
  if (op === 'skip') q.bulkSkip(getDb(), ids);
  else if (op === 'followup' && date) q.bulkFollowUp(getDb(), ids, date);
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

const isStr = (v: unknown): v is string => typeof v === 'string';

function parseConfigs(raw: unknown): TabConfig[] {
  const bad = () => new Error('Invalid import config');
  if (!Array.isArray(raw)) throw bad();
  for (const c of raw) {
    if (!c || typeof c !== 'object') throw bad();
    const { sheet, include, listName, kind, channel, mapping, existingListId } = c as Record<string, unknown>;
    if (!isStr(sheet) || !sheet || typeof include !== 'boolean' || !isStr(listName) || !listName.trim()) throw bad();
    if (kind !== 'contacts' && kind !== 'reference') throw bad();
    if (channel !== 'email' && channel !== 'linkedin') throw bad();
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) throw bad();
    for (const [k, v] of Object.entries(mapping)) {
      if (k === 'exclude' && v === undefined) continue;
      if (k === 'exclude') {
        const e = v as Record<string, unknown> | null;
        if (!e || typeof e !== 'object' || !isStr(e.column) || !isStr(e.contains)) throw bad();
      } else if (v !== undefined && !isStr(v)) throw bad();
    }
    if (existingListId !== null && existingListId !== undefined && !(Number.isInteger(existingListId) && (existingListId as number) > 0)) throw bad();
  }
  return raw as TabConfig[];
}

export async function runImport(fd: FormData): Promise<{ reports: ImportReport[] } | { error: string }> {
  try {
    const { name, sheets } = await sheetsFrom(fd);
    let raw: unknown;
    try { raw = JSON.parse(String(fd.get('config'))); } catch { throw new Error('Invalid import config'); }
    const jobs = parseConfigs(raw).filter(c => c.include).map(cfg => {
      const sheet = sheets.find(s => s.name === cfg.sheet);
      if (!sheet) throw new Error(`Sheet "${cfg.sheet}" not found in ${name}`);
      if (cfg.kind === 'contacts' && !cfg.mapping.name) throw new Error(`"${cfg.sheet}": map the Name column first`);
      return { cfg, sheet };
    });
    const db = getDb();
    const settings = q.getSettings(db);
    const now = new Date();
    try {
      return { reports: jobs.map(({ cfg, sheet }) => importSheet(db, name, sheet, cfg, { now, settings })) };
    } finally { refresh(); }
  } catch (e) { return { error: message(e) }; }
}

export async function saveSettingsAction(_prev: unknown, fd: FormData): Promise<{ ok: boolean; message: string; values?: Record<string, string> }> {
  const values = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
  try {
    q.saveSettings(getDb(), values);
    refresh();
    return { ok: true, message: 'Saved.' };
  } catch (e) { return { ok: false, message: message(e), values }; }
}
