import { describe, expect, test } from 'vitest';
import { openDb, tx } from './db';

describe('db', () => {
  test('creates all tables', () => {
    const db = openDb(':memory:');
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]).map(r => r.name);
    expect(names).toEqual(['contacts', 'events', 'lists', 'settings']);
  });

  test('tx rolls back on error', () => {
    const db = openDb(':memory:');
    expect(() => tx(db, () => {
      db.prepare("INSERT INTO settings (key, value) VALUES ('a', '1')").run();
      throw new Error('boom');
    })).toThrow('boom');
    expect(db.prepare('SELECT COUNT(*) AS n FROM settings').get()).toEqual({ n: 0 });
  });

  test('rejects unknown status', () => {
    const db = openDb(':memory:');
    db.prepare("INSERT INTO lists (name, source_file, source_sheet, header_sig, mapping, imported_at) VALUES ('L','f','s','h','{}','t')").run();
    expect(() => db.prepare("INSERT INTO contacts (list_id, person_key, source_row, name, status, extra) VALUES (1,'k',2,'N','bogus','{}')").run()).toThrow();
  });
});
