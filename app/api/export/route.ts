import { getDb } from '@/lib/db';
import { buildExport } from '@/lib/export';

export const dynamic = 'force-dynamic';

export async function GET() {
  const buf = await buildExport(getDb());
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="outreach-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
