import { describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { classifyCandidate, extractHtmlMetadata, groupRelatedDashboards, isExcludedPath, scanRoots } from '../electron/discovery.ts'
import type { Dashboard } from '../src/types.js'

describe('dashboard discovery', () => {
  it('excludes dependencies, repositories, caches and generated examples', () => {
    expect(isExcludedPath('/work/node_modules/pkg/index.html')).toBe(true)
    expect(isExcludedPath('/work/.git/index.html')).toBe(true)
    expect(isExcludedPath('/work/src/index.html')).toBe(false)
  })

  it('excludes build output and agent/tooling scratch directories', () => {
    expect(isExcludedPath('/work/dist/index.html')).toBe(true)
    expect(isExcludedPath('/work/dist-electron/main.html')).toBe(true)
    expect(isExcludedPath('/work/release/index.html')).toBe(true)
    expect(isExcludedPath('/vault/.superpowers/brainstorm/1/content/index.html')).toBe(true)
    expect(isExcludedPath('/vault/.claude/worktrees/epic-rosalind/index.html')).toBe(true)
    expect(isExcludedPath('/vault/AI/tee-time-bot/logs/index.html')).toBe(true)
    expect(isExcludedPath('/work/distillery-dashboard/index.html')).toBe(false)
  })

  it('extracts useful metadata from standalone HTML', () => {
    const html = '<html><head><title>Example Dashboard</title><meta name="description" content="Call intelligence"></head><body><h1>Today</h1><h2>Pipeline</h2><a href="#">Open</a></body></html>'
    expect(extractHtmlMetadata(html)).toMatchObject({
      title: 'Example Dashboard', description: 'Call intelligence', headings: ['Today', 'Pipeline'], links: 1,
    })
  })

  it('classifies project and archive naming signals', () => {
    expect(classifyCandidate('/Dashboards/live-call/index.html', true).confidence).toBeGreaterThan(0.8)
    expect(classifyCandidate('/docs/GPL.html', false).status).toBe('review')
    expect(classifyCandidate('/dash/versions/1234.html', false).versionLabel).toBe('1234')
  })

  it('groups matching fingerprints as duplicates', () => {
    const base = { title: 'A', fingerprint: 'same', modifiedAt: 20 } as Dashboard
    const grouped = groupRelatedDashboards([
      { ...base, id: 'new', entryPath: '/new.html' },
      { ...base, id: 'old', entryPath: '/old.html', modifiedAt: 10 },
    ])
    expect(grouped.find((item) => item.id === 'old')?.duplicateOf).toBe('new')
  })

  it('collapses mirrored trees of three or more matching files into the canonical copy', () => {
    const file = (id: string, projectRoot: string, entryPath: string, fingerprint: string, modifiedAt: number): Dashboard =>
      ({ id, title: id, fingerprint, modifiedAt, projectRoot, entryPath } as Dashboard)
    const items = [
      file('a1', '/vault/dashboards', '/vault/dashboards/a.html', 'fp-a', 30),
      file('a2', '/vault/dashboards', '/vault/dashboards/b.html', 'fp-b', 30),
      file('a3', '/vault/dashboards', '/vault/dashboards/c.html', 'fp-c', 30),
      file('m1', '/mirror/dashboards', '/mirror/dashboards/a.html', 'fp-a', 10),
      file('m2', '/mirror/dashboards', '/mirror/dashboards/b.html', 'fp-b', 10),
      file('m3', '/mirror/dashboards', '/mirror/dashboards/c.html', 'fp-c', 10),
    ]
    const grouped = groupRelatedDashboards(items)
    expect(grouped.map((item) => item.id)).toEqual(['a1', 'a2', 'a3'])
    expect(grouped.find((item) => item.id === 'a1')?.mirrorPaths).toEqual(['/mirror/dashboards/a.html'])
    expect(grouped.find((item) => item.id === 'a2')?.mirrorPaths).toEqual(['/mirror/dashboards/b.html'])
  })

  it('does not collapse a pair of single-file duplicates across different projects', () => {
    const file = (id: string, projectRoot: string, entryPath: string, fingerprint: string, modifiedAt: number): Dashboard =>
      ({ id, title: id, fingerprint, modifiedAt, projectRoot, entryPath } as Dashboard)
    const items = [
      file('new', '/vault/one', '/vault/one/a.html', 'same', 20),
      file('old', '/vault/two', '/vault/two/a.html', 'same', 10),
    ]
    const grouped = groupRelatedDashboards(items)
    expect(grouped.map((item) => item.id)).toEqual(['new', 'old'])
    expect(grouped.find((item) => item.id === 'new')?.mirrorPaths).toBeUndefined()
  })

  it('does not drop a root that is both a mirror and a canonical for other fingerprints', () => {
    const file = (id: string, projectRoot: string, entryPath: string, fingerprint: string, modifiedAt: number): Dashboard =>
      ({ id, title: id, fingerprint, modifiedAt, projectRoot, entryPath } as Dashboard)
    const items = [
      // Root A is canonical over root B for fp1-fp3 (A newer).
      file('a1', '/root/a', '/root/a/1.html', 'fp1', 30),
      file('a2', '/root/a', '/root/a/2.html', 'fp2', 30),
      file('a3', '/root/a', '/root/a/3.html', 'fp3', 30),
      file('b1', '/root/b', '/root/b/1.html', 'fp1', 10),
      file('b2', '/root/b', '/root/b/2.html', 'fp2', 10),
      file('b3', '/root/b', '/root/b/3.html', 'fp3', 10),
      // Root B is canonical over root C for fp4-fp6 (B newer).
      file('b4', '/root/b', '/root/b/4.html', 'fp4', 30),
      file('b5', '/root/b', '/root/b/5.html', 'fp5', 30),
      file('b6', '/root/b', '/root/b/6.html', 'fp6', 30),
      file('c4', '/root/c', '/root/c/4.html', 'fp4', 10),
      file('c5', '/root/c', '/root/c/5.html', 'fp5', 10),
      file('c6', '/root/c', '/root/c/6.html', 'fp6', 10),
    ]
    const grouped = groupRelatedDashboards(items)
    const ids = grouped.map((item) => item.id)

    // A's cards are untouched.
    expect(ids).toEqual(expect.arrayContaining(['a1', 'a2', 'a3']))
    // B is on both sides (mirror of A, canonical for C) so it must NOT be collapsed away.
    expect(ids).toEqual(expect.arrayContaining(['b1', 'b2', 'b3', 'b4', 'b5', 'b6']))
    expect(grouped.find((item) => item.id === 'b1')?.duplicateOf).toBe('a1')
    expect(grouped.find((item) => item.id === 'b4')?.mirrorPaths).toEqual(['/root/c/4.html'])
    // C's cards were collapsed into B.
    expect(ids).not.toEqual(expect.arrayContaining(['c4', 'c5', 'c6']))
  })

  it('indexes iCloud placeholders as download-required records', async () => {
    const root = await mkdtemp('/tmp/Mobile Documents-')
    const folder = path.join(root, 'Dashboard Hub'); await mkdir(folder)
    await writeFile(path.join(folder, '.example-dashboard.html.icloud'), '')
    const result = await scanRoots([root])
    expect(result.dashboards[0]).toMatchObject({ title: 'example-dashboard', status: 'icloud', location: 'icloud' })
  })

  it('derives archived lifecycle for iCloud placeholders under an Archive path', async () => {
    const root = await mkdtemp('/tmp/Mobile Documents-')
    const folder = path.join(root, 'Archive', 'Old Cockpit'); await mkdir(folder, { recursive: true })
    await writeFile(path.join(folder, '.example-dashboard.html.icloud'), '')
    const result = await scanRoots([root])
    expect(result.dashboards[0]).toMatchObject({ status: 'icloud', lifecycle: 'archived' })
  })

  it('derives purpose, location, and lifecycle facets for discovered files', async () => {
    const root = await mkdtemp('/tmp/Desktop-')
    const folder = path.join(root, 'Dashboard Portfolio'); await mkdir(folder)
    await writeFile(path.join(folder, 'index.html'), '<html><head><title>Pipeline Cockpit</title></head><body></body></html>')
    const result = await scanRoots([root])
    expect(result.dashboards[0]).toMatchObject({ purpose: 'cockpit', where: 'desktop', lifecycle: 'live' })
  })

  it('rolls up all HTML files under a project into a single dashboard with a file count', async () => {
    const root = await mkdtemp('/tmp/Documents-')
    const project = path.join(root, 'my-cockpit'); await mkdir(project)
    await writeFile(path.join(project, 'package.json'), JSON.stringify({ dependencies: { react: '18.0.0' } }))
    await writeFile(path.join(project, 'index.html'), '<html><head><title>Cockpit</title></head></html>')
    await writeFile(path.join(project, 'about.html'), '<html><head><title>About</title></head></html>')
    const result = await scanRoots([root])
    expect(result.dashboards).toHaveLength(1)
    expect(result.dashboards[0]).toMatchObject({ title: 'Cockpit', fileCount: 2 })
  })

  it('leaves standalone HTML files ungrouped when no package.json is present', async () => {
    const root = await mkdtemp('/tmp/Documents-')
    await writeFile(path.join(root, 'a.html'), '<html><head><title>A</title></head></html>')
    await writeFile(path.join(root, 'b.html'), '<html><head><title>B</title></head></html>')
    const result = await scanRoots([root])
    expect(result.dashboards).toHaveLength(2)
    expect(result.dashboards.every((item) => item.fileCount === undefined)).toBe(true)
  })
})
