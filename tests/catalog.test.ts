import { afterEach, describe, expect, it } from 'vitest'
import { Catalog } from '../electron/catalog.ts'
import type { Dashboard } from '../src/types.js'

const sample = (overrides: Partial<Dashboard> = {}): Dashboard => ({
  id: 'one', title: 'One', description: '', entryPath: '/tmp/one.html', projectRoot: '/tmp',
  location: 'local', kind: 'standalone-html', framework: 'HTML', status: 'ready', confidence: 1,
  fingerprint: 'hash', modifiedAt: 1, createdAt: 1, headings: [], links: 0, textContent: '', scripts: {},
  dependencies: [], tags: [], note: '', favorite: false, improvementStatus: 'none',
  purpose: 'uncategorized', where: 'documents', lifecycle: 'live', ...overrides,
})

describe('catalog', () => {
  const catalogs: Catalog[] = []
  afterEach(() => catalogs.splice(0).forEach((catalog) => catalog.close()))

  it('upserts discoveries while preserving user metadata', () => {
    const catalog = new Catalog(':memory:'); catalogs.push(catalog)
    catalog.upsertDashboards([sample()])
    catalog.update('one', { favorite: true, note: 'Improve navigation', tags: ['sample'] })
    catalog.upsertDashboards([sample({ title: 'Renamed' })])
    expect(catalog.list()[0]).toMatchObject({ title: 'Renamed', favorite: true, note: 'Improve navigation', tags: ['sample'] })
  })

  it('marks unseen dashboards missing without deleting records', () => {
    const catalog = new Catalog(':memory:'); catalogs.push(catalog)
    catalog.upsertDashboards([sample()])
    catalog.markMissing(new Set())
    expect(catalog.list()[0].status).toBe('missing')
  })

  it('coalesces missing purpose/where/lifecycle facets on pre-feature rows', () => {
    const catalog = new Catalog(':memory:'); catalogs.push(catalog)
    const legacyRow = sample() as unknown as Record<string, unknown>
    delete legacyRow.purpose
    delete legacyRow.where
    delete legacyRow.lifecycle
    catalog.upsertDashboards([legacyRow as unknown as Dashboard])
    expect(catalog.list()[0]).toMatchObject({ purpose: 'uncategorized', where: 'documents', lifecycle: 'live' })
    expect(catalog.get('one')).toMatchObject({ purpose: 'uncategorized', where: 'documents', lifecycle: 'live' })
  })
})
