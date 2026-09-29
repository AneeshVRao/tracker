import ExcelJS from 'exceljs';
import type { Contact, DB, List } from './db';
import { STATUS_LABEL } from './rules';

function sheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[\[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28) || 'List';
  let n = base;
  for (let i = 2; used.has(n.toLowerCase()); i++) n = `${base} ${i}`;
  used.add(n.toLowerCase());
  return n;
}

export async function buildExport(db: DB): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const used = new Set<string>();
  for (const l of db.prepare("SELECT * FROM lists WHERE kind = 'contacts' ORDER BY id").all() as List[]) {
    const ws = wb.addWorksheet(sheetName(l.name, used));
    const headers = JSON.parse(l.headers) as string[];
    ws.addRow([...headers, 'Status', 'Outcome', 'Sent At', 'Follow Up On', 'Message (current)', 'My Notes', 'Last Touch']).font = { bold: true };
    for (const c of db.prepare('SELECT * FROM contacts WHERE list_id = ? ORDER BY source_row').all(l.id) as Contact[]) {
      const extra = JSON.parse(c.extra) as Record<string, string>;
      ws.addRow([
        ...headers.map(h => extra[h] ?? ''), STATUS_LABEL[c.status], c.outcome ?? '', c.sent_at?.slice(0, 10) ?? '',
        c.follow_up_on ?? '', c.message ?? '', c.my_notes ?? '', c.last_touch_at?.slice(0, 10) ?? '',
      ]);
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
