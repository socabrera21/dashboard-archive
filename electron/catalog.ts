import { DatabaseSync } from 'node:sqlite'
import type { CatalogPatch, Dashboard, ScanRoot } from '../src/types.js'

// Rows written before the purpose/where/lifecycle facets existed are missing these
// fields entirely. Coalesce safe defaults so old catalog rows never reach the UI
// with `undefined` facets (which crashes grouping/labeling in the default grid view).
function coalesceFacets(parsed: Dashboard): Dashboard {
  return {
    ...parsed,
    purpose: parsed.purpose ?? 'uncategorized',
    where: parsed.where ?? 'documents',
    lifecycle: parsed.lifecycle ?? 'live',
  }
}

export class Catalog {
  private db: DatabaseSync
  constructor(filename: string) {
    this.db = new DatabaseSync(filename)
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS dashboards (id TEXT PRIMARY KEY, data TEXT NOT NULL, seen INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS roots (path TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1, last_scanned_at INTEGER);
    `)
  }
  close() { this.db.close() }
  list(): Dashboard[] {
    return this.db.prepare('SELECT data FROM dashboards ORDER BY json_extract(data, \'$.modifiedAt\') DESC').all()
      .map((row) => coalesceFacets(JSON.parse(String((row as { data: string }).data))))
  }
  get(id: string): Dashboard | undefined {
    const row = this.db.prepare('SELECT data FROM dashboards WHERE id = ?').get(id) as { data: string } | undefined
    return row ? coalesceFacets(JSON.parse(row.data)) : undefined
  }
  upsertDashboards(items: Dashboard[]) {
    const statement = this.db.prepare('INSERT INTO dashboards(id, data, seen) VALUES (?, ?, 1) ON CONFLICT(id) DO UPDATE SET data=excluded.data, seen=1')
    this.db.exec('BEGIN')
    try {
      for (const incoming of items) {
        const existing = this.get(incoming.id)
        const merged = existing ? { ...incoming, tags: existing.tags, note: existing.note, favorite: existing.favorite, improvementStatus: existing.improvementStatus } : incoming
        statement.run(merged.id, JSON.stringify(merged))
      }
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  update(id: string, patch: CatalogPatch): Dashboard {
    const current = this.get(id); if (!current) throw new Error('Dashboard not found')
    const next = { ...current, ...patch }; this.db.prepare('UPDATE dashboards SET data = ? WHERE id = ?').run(JSON.stringify(next), id); return next
  }
  markMissing(seen: Set<string>) {
    for (const item of this.list()) if (!seen.has(item.id)) this.db.prepare('UPDATE dashboards SET data = ?, seen = 0 WHERE id = ?').run(JSON.stringify({ ...item, status: 'missing' }), item.id)
  }
  roots(): ScanRoot[] { return this.db.prepare('SELECT path, enabled, last_scanned_at FROM roots').all().map((row) => ({ path: String((row as any).path), enabled: Boolean((row as any).enabled), lastScannedAt: Number((row as any).last_scanned_at) || undefined })) }
  addRoot(root: string) { this.db.prepare('INSERT INTO roots(path, enabled) VALUES (?, 1) ON CONFLICT(path) DO UPDATE SET enabled=1').run(root) }
  removeRoot(root: string) { this.db.prepare('DELETE FROM roots WHERE path = ?').run(root) }
  touchRoots() { this.db.prepare('UPDATE roots SET last_scanned_at = ? WHERE enabled = 1').run(Date.now()) }
}
