import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import fg from 'fast-glob'
import type { Dashboard, ScanResult } from '../src/types.js'
import { deriveLifecycle, derivePurpose, deriveWhere } from './categorize.js'

const EXCLUDED = new Set(['node_modules', '.git', '.next', '.cache', 'coverage', '__pycache__', '.venv', 'dist', 'build', 'out', 'release', '.parcel-cache', '.superpowers', 'worktrees', 'logs'])

export function isExcludedPath(candidate: string): boolean {
  return candidate.split(path.sep).some((part) => EXCLUDED.has(part) || part.startsWith('dist-'))
}

function plainText(input: string): string {
  return input.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ').trim()
}

function firstMatch(input: string, expression: RegExp): string {
  return plainText(expression.exec(input)?.[1] ?? '')
}

export function extractHtmlMetadata(html: string) {
  const title = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i)
  const description = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(html)?.[1]
    ?? /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i.exec(html)?.[1] ?? ''
  const headings = [...html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map((match) => plainText(match[1])).filter(Boolean).slice(0, 12)
  const links = [...html.matchAll(/<a\s[^>]*href=/gi)].length
  return { title, description: plainText(description), headings, links, textContent: plainText(html).slice(0, 20_000) }
}

export function classifyCandidate(entryPath: string, hasProjectManifest: boolean) {
  const lower = entryPath.toLowerCase()
  const highSignal = /(dashboard|cockpit|hub|portal|tracker|playbook|battlecard|briefing|call|sales|website)/.test(lower)
  const lowSignal = /(license|gpl|readme|docs|example|test[-_.]?report)/.test(lower)
  const version = /(?:versions?[/\\]|[-_.](?:v|version)?)(\d{2,}|v?\d+(?:\.\d+)*)/i.exec(entryPath)?.[1]
  const archived = /(archive|legacy|earlier|backup|copy|duplicate)/i.test(entryPath)
  const confidence = Math.max(0.2, Math.min(1, 0.45 + (hasProjectManifest ? 0.35 : 0) + (highSignal ? 0.3 : 0) - (lowSignal ? 0.4 : 0)))
  return { confidence, status: confidence >= 0.7 ? 'ready' as const : 'review' as const, versionLabel: version || (archived ? 'Archived' : undefined) }
}

export function groupRelatedDashboards(items: Dashboard[]): Dashboard[] {
  const fingerprintGroups = new Map<string, Dashboard[]>()
  items.forEach((item) => fingerprintGroups.set(item.fingerprint, [...(fingerprintGroups.get(item.fingerprint) ?? []), item]))
  for (const group of fingerprintGroups.values()) {
    if (group.length < 2) continue
    group.sort((a, b) => b.modifiedAt - a.modifiedAt)
    group.slice(1).forEach((item) => { item.duplicateOf = group[0].id })
  }

  const pairCounts = new Map<string, { canonicalRoot: string; mirrorRoot: string; count: number }>()
  for (const item of items) {
    if (!item.duplicateOf) continue
    const canonical = items.find((candidate) => candidate.id === item.duplicateOf)
    if (!canonical || canonical.projectRoot === item.projectRoot) continue
    const key = `${canonical.projectRoot}\0${item.projectRoot}`
    const entry = pairCounts.get(key) ?? { canonicalRoot: canonical.projectRoot, mirrorRoot: item.projectRoot, count: 0 }
    entry.count += 1
    pairCounts.set(key, entry)
  }

  const mirrorRootsToCollapse = new Map<string, string>()
  for (const { canonicalRoot, mirrorRoot, count } of pairCounts.values()) {
    if (count >= 3) mirrorRootsToCollapse.set(mirrorRoot, canonicalRoot)
  }
  // A root that also serves as a canonical root for other fingerprints must not be
  // collapsed away — doing so would silently destroy cards other roots depend on.
  const canonicalRoots = new Set(mirrorRootsToCollapse.values())
  for (const mirrorRoot of [...mirrorRootsToCollapse.keys()]) {
    if (canonicalRoots.has(mirrorRoot)) mirrorRootsToCollapse.delete(mirrorRoot)
  }
  if (mirrorRootsToCollapse.size === 0) return items

  const survivors: Dashboard[] = []
  for (const item of items) {
    const canonicalRoot = mirrorRootsToCollapse.get(item.projectRoot)
    if (!canonicalRoot) { survivors.push(item); continue }
    const canonical = items.find((candidate) => candidate.projectRoot === canonicalRoot && candidate.fingerprint === item.fingerprint)
    if (canonical) canonical.mirrorPaths = [...(canonical.mirrorPaths ?? []), item.entryPath]
  }
  return survivors
}

async function readPackageJson(directory: string): Promise<{ scripts: Record<string, string>; dependencies: string[]; framework: string } | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8')) as Record<string, Record<string, string>>
    const deps = { ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}) }
    const framework = deps.next ? 'Next.js' : deps['@vitejs/plugin-react'] || deps.react ? 'React / Vite' : deps.vue ? 'Vue' : deps.svelte ? 'Svelte' : 'Web project'
    return { scripts: parsed.scripts ?? {}, dependencies: Object.keys(deps).sort(), framework }
  } catch { return null }
}

async function dashboardFromFile(entryPath: string, root: string): Promise<Dashboard | null> {
  try {
    const [html, stat] = await Promise.all([fs.readFile(entryPath, 'utf8'), fs.stat(entryPath)])
    const directory = path.dirname(entryPath)
    const manifest = await readPackageJson(directory)
    const metadata = extractHtmlMetadata(html)
    const classification = classifyCandidate(entryPath, Boolean(manifest))
    const fingerprint = createHash('sha256').update(html.replace(/\s+/g, ' ')).digest('hex')
    const id = createHash('sha256').update(path.resolve(entryPath)).digest('hex').slice(0, 20)
    const title = metadata.title || path.basename(directory) || path.basename(entryPath, '.html')
    return {
      id, title, description: metadata.description,
      entryPath, projectRoot: directory, location: entryPath.includes('Mobile Documents') ? 'icloud' : 'local',
      kind: manifest ? 'web-project' : 'standalone-html', framework: manifest?.framework ?? 'HTML',
      status: classification.status, confidence: classification.confidence, fingerprint, modifiedAt: stat.mtimeMs,
      createdAt: stat.birthtimeMs || stat.ctimeMs, headings: metadata.headings, links: metadata.links,
      textContent: metadata.textContent, scripts: manifest?.scripts ?? {}, dependencies: manifest?.dependencies ?? [],
      tags: [], note: '', favorite: false, improvementStatus: 'none', versionLabel: classification.versionLabel,
      purpose: derivePurpose(entryPath, title, metadata.headings), where: deriveWhere(root),
      lifecycle: deriveLifecycle(entryPath, 'none', classification.confidence),
    }
  } catch { return null }
}

async function dashboardFromICloudPlaceholder(placeholderPath: string, root: string): Promise<Dashboard> {
  const stat = await fs.stat(placeholderPath)
  const rawName = path.basename(placeholderPath).replace(/^\./, '').replace(/\.icloud$/i, '')
  const intendedPath = path.join(path.dirname(placeholderPath), rawName)
  const title = path.basename(rawName, '.html')
  const confidence = classifyCandidate(intendedPath, false).confidence
  return {
    id: createHash('sha256').update(path.resolve(intendedPath)).digest('hex').slice(0, 20), title, description: 'This dashboard is stored in iCloud and must be downloaded before it can be previewed.',
    entryPath: intendedPath, projectRoot: path.dirname(intendedPath), location: 'icloud', kind: 'standalone-html', framework: 'HTML',
    status: 'icloud', confidence, fingerprint: `icloud:${createHash('sha256').update(intendedPath).digest('hex')}`,
    modifiedAt: stat.mtimeMs, createdAt: stat.birthtimeMs || stat.ctimeMs, headings: [], links: 0, textContent: title, scripts: {}, dependencies: [],
    tags: [], note: '', favorite: false, improvementStatus: 'none',
    purpose: derivePurpose(intendedPath, title, []), where: deriveWhere(root), lifecycle: deriveLifecycle(intendedPath, 'none', confidence),
  }
}

async function pathExists(target: string): Promise<boolean> {
  try { await fs.access(target); return true } catch { return false }
}

async function findProjectRoot(startDir: string, scanRoot: string): Promise<string | null> {
  const boundary = path.resolve(scanRoot)
  let dir = path.resolve(startDir)
  while (true) {
    if (await pathExists(path.join(dir, 'package.json'))) return dir
    if (dir === boundary) return null
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

export async function scanRoots(roots: string[], onProgress?: (message: string) => void): Promise<ScanResult> {
  const dashboards: Dashboard[] = []; const errors: string[] = []; let scannedFiles = 0; let skippedFiles = 0
  const ignore = [...EXCLUDED].flatMap((folder) => [`**/${folder}/**`])
  for (const root of roots) {
    onProgress?.(`Finding pages in ${path.basename(root) || root}…`)
    let candidates: string[] = []
    try {
      candidates = await fg(['**/*.html', '**/*.html.icloud'], { cwd: root, absolute: true, onlyFiles: true, dot: true, followSymbolicLinks: false, suppressErrors: true, ignore })
    } catch (error) { errors.push(`${root}: ${String(error)}`); continue }

    const icloudTargets = candidates.filter((target) => target.toLowerCase().endsWith('.html.icloud'))
    const htmlTargets = candidates.filter((target) => !target.toLowerCase().endsWith('.html.icloud') && !isExcludedPath(target))
    skippedFiles += candidates.length - icloudTargets.length - htmlTargets.length

    const projectGroups = new Map<string, string[]>()
    const standalone: string[] = []
    for (const target of htmlTargets) {
      const projectRoot = await findProjectRoot(path.dirname(target), root)
      if (!projectRoot) { standalone.push(target); continue }
      projectGroups.set(projectRoot, [...(projectGroups.get(projectRoot) ?? []), target])
    }

    const rollupTargets: Array<{ entry: string; fileCount: number }> = []
    for (const files of projectGroups.values()) {
      const entry = files.reduce((best, candidate) => {
        if (path.basename(candidate).toLowerCase() === 'index.html') return candidate
        if (path.basename(best).toLowerCase() === 'index.html') return best
        return classifyCandidate(candidate, true).confidence >= classifyCandidate(best, true).confidence ? candidate : best
      }, files[0])
      rollupTargets.push({ entry, fileCount: files.length })
    }

    const allTargets: Array<{ entry: string; fileCount?: number }> = [
      ...standalone.map((entry) => ({ entry })),
      ...rollupTargets,
    ]
    for (let index = 0; index < allTargets.length; index += 12) {
      const batch = allTargets.slice(index, index + 12)
      const found = await Promise.all(batch.map(async ({ entry, fileCount }) => {
        scannedFiles++
        const dashboard = await dashboardFromFile(entry, root)
        if (dashboard && fileCount && fileCount > 1) dashboard.fileCount = fileCount
        return dashboard
      }))
      dashboards.push(...found.filter((item): item is Dashboard => Boolean(item)))
      onProgress?.(`Inspected ${Math.min(index + batch.length, allTargets.length).toLocaleString()} of ${allTargets.length.toLocaleString()} pages in ${path.basename(root)}…`)
    }

    for (let index = 0; index < icloudTargets.length; index += 12) {
      const batch = icloudTargets.slice(index, index + 12)
      const found = await Promise.all(batch.map((target) => { scannedFiles++; return dashboardFromICloudPlaceholder(target, root) }))
      dashboards.push(...found)
    }
  }
  return { dashboards: groupRelatedDashboards(dashboards), scannedFiles, skippedFiles, errors }
}
