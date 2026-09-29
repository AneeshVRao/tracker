import ExcelJS from 'exceljs';

export type Sheet = { name: string; headers: string[]; rows: { row: number; values: Record<string, string> }[] };

export function cellText(v: ExcelJS.CellValue | undefined): string {
  if (v == null) return '';
  if (v instanceof Date) return Number.isNaN(+v) ? '' : v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map(t => t.text).join('');
    if ('formula' in v || 'sharedFormula' in v) return cellText((v as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
    if ('text' in v) return cellText((v as ExcelJS.CellHyperlinkValue).text as ExcelJS.CellValue);
    if ('error' in v) return '';
  }
  return String(v);
}

function uniqueHeaders(cells: string[]): string[] {
  const seen = new Map<string, number>();
  return cells.map((c, i) => {
    const base = c.trim() || `Column ${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

export async function readWorkbook(data: Buffer): Promise<Sheet[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as unknown as ExcelJS.Buffer);
  return wb.worksheets.map(ws => {
    let headers: string[] = [];
    const rows: Sheet['rows'] = [];
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      // row.values is 1-indexed and sparse; Array.from fills holes with undefined
      const cells = Array.from((row.values as ExcelJS.CellValue[]).slice(1), v => cellText(v).trim());
      if (!headers.length) {
        if (cells.filter(Boolean).length >= 3) headers = uniqueHeaders(cells);
        return;
      }
      if (!cells.some(Boolean)) return;
      rows.push({ row: n, values: Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ''])) });
    });
    return { name: ws.name, headers, rows };
  });
}
