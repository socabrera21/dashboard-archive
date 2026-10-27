import { useEffect, useMemo, useState } from 'react'
import { Archive, ArrowUpRight, Check, Clipboard, Code2, Folder, Grid2X2, Heart, List, Plus, RefreshCw, Search, Tag, X } from 'lucide-react'
import type { CatalogPatch, Dashboard, ScanRoot } from './types.js'

type View = 'all' | 'favorites' | 'recent' | 'review' | 'duplicates' | 'missing'
const views: Array<{ id: View; label: string }> = [
  { id: 'all', label: 'All works' }, { id: 'favorites', label: 'Favorites' }, { id: 'recent', label: 'Recently modified' },
  { id: 'review', label: 'Needs review' }, { id: 'duplicates', label: 'Duplicates' }, { id: 'missing', label: 'Missing source' },
]

const PURPOSES = ['cockpit', 'talk-track', 'playbook', 'battlecard', 'one-pager', 'experiment', 'tooling', 'uncategorized'] as const
const WHERES = ['vault', 'documents', 'icloud', 'desktop'] as const
const LIFECYCLES = ['live', 'draft', 'archived'] as const
type GroupAxis = 'purpose' | 'where' | 'techKind' | 'lifecycle'

function facetLabel(value: string) { return value.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) }
function toggleInSet(current: Set<string>, value: string): Set<string> {
  const next = new Set(current)
  if (next.has(value)) next.delete(value); else next.add(value)
  return next
}
function groupKey(dashboard: Dashboard, axis: GroupAxis) {
  return axis === 'purpose' ? dashboard.purpose : axis === 'where' ? dashboard.where : axis === 'lifecycle' ? dashboard.lifecycle : dashboard.framework
}

function formatDate(timestamp: number) { return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(timestamp) }
function shortPath(value: string) { return value.replace(/^\/Users\/[^/]+(?=\/)/, '~') }

function Thumbnail({ dashboard }: { dashboard: Dashboard }) {
  const [source, setSource] = useState<string | null>(dashboard.thumbnailUrl ?? null)
  useEffect(() => { let active = true; if (!source) window.dashboardAPI?.thumbnail(dashboard.id).then((value) => { if (active) setSource(value) }); return () => { active = false } }, [dashboard.id])
  return <div className="thumbnail" aria-hidden="true">
    {source ? <img src={source} alt="" /> : <div className="thumbnail-fallback"><span>{dashboard.framework}</span><strong>{dashboard.title.slice(0, 1)}</strong></div>}
    <span className={`status-dot status-${dashboard.status}`} />
    {dashboard.mirrorPaths && dashboard.mirrorPaths.length > 0 && <span className="copies">{dashboard.mirrorPaths.length + 1} copies</span>}
  </div>
}

function DashboardCard({ dashboard, index, onOpen }: { dashboard: Dashboard; index: number; onOpen: () => void }) {
  return <article className="dashboard-card" style={{ '--delay': `${Math.min(index, 12) * 35}ms` } as React.CSSProperties}>
    <button className="card-open" onClick={onOpen} aria-label={`Inspect ${dashboard.title}`}><Thumbnail dashboard={dashboard} /></button>
    <div className="card-meta">
      <span className="index-mark">{String(index + 1).padStart(2, '0')}</span>
      <div><button className="card-title" onClick={onOpen}>{dashboard.title}</button><p>{dashboard.framework} · {formatDate(dashboard.modifiedAt)}</p></div>
      {dashboard.favorite && <Heart className="favorite-mark" size={15} fill="currentColor" />}
    </div>
    <div className="tag-row">{dashboard.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}{dashboard.versionLabel && <span>{dashboard.versionLabel}</span>}</div>
  </article>
}

function DashboardRow({ dashboard, index, onOpen }: { dashboard: Dashboard; index: number; onOpen: () => void }) {
  return <button className="dashboard-row" onClick={onOpen}>
    <span className="index-mark">{String(index + 1).padStart(2, '0')}</span><span className="row-title">{dashboard.title}</span>
    <span>{dashboard.framework}</span><span>{dashboard.location}</span><span>{formatDate(dashboard.modifiedAt)}</span><ArrowUpRight size={17} />
  </button>
}

function Detail({ dashboard, onClose, onPatch }: { dashboard: Dashboard; onClose: () => void; onPatch: (patch: CatalogPatch) => Promise<void> }) {
  const [note, setNote] = useState(dashboard.note)
  const [tagText, setTagText] = useState('')
  const addTag = async () => { const value = tagText.trim().toLowerCase(); if (!value || dashboard.tags.includes(value)) return; await onPatch({ tags: [...dashboard.tags, value] }); setTagText('') }
  return <div className="detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="detail-panel" role="dialog" aria-modal="true" aria-labelledby="detail-title">
      <button className="icon-button close-button" onClick={onClose} aria-label="Close detail"><X /></button>
      <div className="detail-hero"><Thumbnail dashboard={dashboard} /><div className="hero-number">ARCHIVE / {dashboard.id.slice(0, 4).toUpperCase()}</div></div>
      <div className="detail-body">
        <header className="detail-heading"><div><p className="eyebrow">{dashboard.kind.replace('-', ' ')} · {dashboard.location}</p><h2 id="detail-title">{dashboard.title}</h2><p>{dashboard.description || dashboard.headings[0] || 'No page description was found.'}</p></div>
          <button className={`heart-button ${dashboard.favorite ? 'active' : ''}`} onClick={() => onPatch({ favorite: !dashboard.favorite })} aria-label={dashboard.favorite ? 'Remove from favorites' : 'Add to favorites'}><Heart fill={dashboard.favorite ? 'currentColor' : 'none'} /></button>
        </header>
        <div className="action-strip">
          <button onClick={() => window.dashboardAPI?.open(dashboard.id)}><ArrowUpRight size={16} /> Open dashboard</button>
          <button onClick={() => window.dashboardAPI?.openEditor(dashboard.id)}><Code2 size={16} /> Open in editor</button>
          <button onClick={() => window.dashboardAPI?.reveal(dashboard.id)}><Folder size={16} /> Finder</button>
          <button onClick={() => window.dashboardAPI?.copyPath(dashboard.id)} aria-label="Copy path"><Clipboard size={16} /></button>
        </div>
        <div className="detail-grid">
          <div className="detail-section wide"><h3>Source</h3><code>{shortPath(dashboard.entryPath)}</code></div>
          <div className="detail-section"><h3>Technology</h3><strong>{dashboard.framework}</strong><p>{dashboard.dependencies.length} dependencies · {Object.keys(dashboard.scripts).length} scripts</p></div>
          <div className="detail-section"><h3>Discovery</h3><strong>{Math.round(dashboard.confidence * 100)}% confidence</strong><p>{dashboard.status} · {dashboard.links} links</p></div>
          <div className="detail-section wide"><h3>Page outline</h3><div className="outline-list">{dashboard.headings.length ? dashboard.headings.map((heading, index) => <span key={`${heading}-${index}`}>{String(index + 1).padStart(2, '0')} {heading}</span>) : <em>No headings detected</em>}</div></div>
          <div className="detail-section wide"><h3>Tags</h3><div className="tag-editor">{dashboard.tags.map((tag) => <button key={tag} onClick={() => onPatch({ tags: dashboard.tags.filter((item) => item !== tag) })}>{tag} ×</button>)}<input value={tagText} onChange={(event) => setTagText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void addTag() }} placeholder="Add tag" /><button onClick={() => void addTag()} aria-label="Add tag"><Plus size={15} /></button></div></div>
          <div className="detail-section wide"><h3>Improvement notes</h3><textarea value={note} onChange={(event) => setNote(event.target.value)} onBlur={() => { if (note !== dashboard.note) void onPatch({ note }) }} placeholder="Capture what you want to improve next…" />
            <select value={dashboard.improvementStatus} onChange={(event) => onPatch({ improvementStatus: event.target.value as Dashboard['improvementStatus'] })}><option value="none">No status</option><option value="planned">Planned</option><option value="in-progress">In progress</option><option value="complete">Complete</option></select></div>
          {dashboard.mirrorPaths && dashboard.mirrorPaths.length > 0 && <div className="detail-section wide"><h3>Copies found elsewhere</h3><div className="mirror-list">{dashboard.mirrorPaths.map((path) => <div key={path} className="mirror-row"><code>{path}</code><button onClick={() => window.dashboardAPI?.revealPath(path)}>Reveal copy</button></div>)}</div></div>}
        </div>
      </div>
    </section>
  </div>
}

export default function App() {
  const [dashboards, setDashboards] = useState<Dashboard[]>([]); const [roots, setRoots] = useState<ScanRoot[]>([])
  const [loading, setLoading] = useState(true); const [scanning, setScanning] = useState(false); const [progress, setProgress] = useState('Preparing archive…')
  const [query, setQuery] = useState(''); const [view, setView] = useState<View>('all'); const [layout, setLayout] = useState<'grid' | 'list'>('grid')
  const [selectedId, setSelectedId] = useState<string | null>(null); const [showRoots, setShowRoots] = useState(false)
  const [purposeFilter, setPurposeFilter] = useState<Set<string>>(new Set())
  const [whereFilter, setWhereFilter] = useState<Set<string>>(new Set())
  const [techFilter, setTechFilter] = useState<Set<string>>(new Set())
  const [lifecycleFilter, setLifecycleFilter] = useState<Set<string>>(new Set())
  const [groupBy, setGroupBy] = useState<GroupAxis>('purpose')

  const load = async () => { if (!window.dashboardAPI) { setLoading(false); return }; const [items, scanRoots] = await Promise.all([window.dashboardAPI.list(), window.dashboardAPI.getRoots()]); setDashboards(items); setRoots(scanRoots); setLoading(false) }
  useEffect(() => {
    void load()
    const unsubscribeProgress = window.dashboardAPI?.onScanProgress(setProgress)
    const unsubscribeCatalog = window.dashboardAPI?.onCatalogChanged(setDashboards)
    return () => { unsubscribeProgress?.(); unsubscribeCatalog?.() }
  }, [])
  useEffect(() => { const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelectedId(null); if (event.key === '/' && !selectedId) { event.preventDefault(); document.querySelector<HTMLInputElement>('.search-input')?.focus() } }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler) }, [selectedId])

  const visible = useMemo(() => dashboards.filter((item) => {
    const matchesView = view === 'all' || (view === 'favorites' && item.favorite) || (view === 'review' && item.status === 'review') || (view === 'duplicates' && Boolean(item.duplicateOf)) || (view === 'missing' && item.status === 'missing') || (view === 'recent' && Date.now() - item.modifiedAt < 1000 * 60 * 60 * 24 * 30)
    const matchesFacets = (purposeFilter.size === 0 || purposeFilter.has(item.purpose)) && (whereFilter.size === 0 || whereFilter.has(item.where)) && (techFilter.size === 0 || techFilter.has(item.framework)) && (lifecycleFilter.size === 0 || lifecycleFilter.has(item.lifecycle))
    const terms = `${item.title} ${item.description} ${item.framework} ${item.entryPath} ${item.tags.join(' ')} ${item.textContent}`.toLowerCase()
    return matchesView && matchesFacets && terms.includes(query.toLowerCase())
  }), [dashboards, query, view, purposeFilter, whereFilter, techFilter, lifecycleFilter])
  const techOptions = useMemo(() => Array.from(new Set(dashboards.map((item) => item.framework))).sort(), [dashboards])
  const grouped = useMemo(() => {
    const sections = new Map<string, Dashboard[]>()
    visible.forEach((item) => { const key = groupKey(item, groupBy); sections.set(key, [...(sections.get(key) ?? []), item]) })
    return Array.from(sections.entries()).sort((a, b) => b[1].length - a[1].length)
  }, [visible, groupBy])
  const selected = dashboards.find((item) => item.id === selectedId)
  const scan = async () => { if (!window.dashboardAPI || scanning) return; setScanning(true); setProgress('Starting scan…'); try { const result = await window.dashboardAPI.scan(); setDashboards(result.dashboards); setProgress(`Indexed ${result.dashboards.length.toLocaleString()} works`) } finally { setScanning(false) } }
  const addRoot = async () => { const root = await window.dashboardAPI?.chooseRoot(); if (!root) return; setRoots((items) => [...items, root]); if (!dashboards.length && !roots.length) void scan() }
  const patchSelected = async (patch: CatalogPatch) => { if (!selected || !window.dashboardAPI) return; const updated = await window.dashboardAPI.update(selected.id, patch); setDashboards((items) => items.map((item) => item.id === updated.id ? updated : item)) }

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><Archive size={21} /><span>DASH / ARCHIVE</span></div>
      <nav aria-label="Library views">{views.map((item) => <button key={item.id} aria-label={`Filter: ${item.label}`} className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}><span>{item.label}</span><small>{item.id === 'all' ? dashboards.length : item.id === 'favorites' ? dashboards.filter((d) => d.favorite).length : item.id === 'review' ? dashboards.filter((d) => d.status === 'review').length : item.id === 'duplicates' ? dashboards.filter((d) => d.duplicateOf).length : item.id === 'missing' ? dashboards.filter((d) => d.status === 'missing').length : ''}</small></button>)}</nav>
      <div className="facet"><h4>Purpose</h4><div className="chips">{PURPOSES.map((value) => <button key={value} className={purposeFilter.has(value) ? 'chip on' : 'chip'} onClick={() => setPurposeFilter((current) => toggleInSet(current, value))}>{facetLabel(value)}</button>)}</div></div>
      <div className="facet"><h4>Where</h4><div className="chips">{WHERES.map((value) => <button key={value} className={whereFilter.has(value) ? 'chip on' : 'chip'} onClick={() => setWhereFilter((current) => toggleInSet(current, value))}>{facetLabel(value)}</button>)}</div></div>
      <div className="facet"><h4>Tech</h4><div className="chips">{techOptions.map((value) => <button key={value} className={techFilter.has(value) ? 'chip on' : 'chip'} onClick={() => setTechFilter((current) => toggleInSet(current, value))}>{value}</button>)}</div></div>
      <div className="facet"><h4>Lifecycle</h4><div className="chips">{LIFECYCLES.map((value) => <button key={value} className={lifecycleFilter.has(value) ? 'chip on' : 'chip'} onClick={() => setLifecycleFilter((current) => toggleInSet(current, value))}>{facetLabel(value)}</button>)}</div></div>
      <div className="sidebar-bottom"><button onClick={() => setShowRoots(!showRoots)}><Folder size={16} /> Scan locations</button><div className="storage-note"><span className="pulse" /> Local-only catalog</div></div>
    </aside>
    <section className="workspace">
      <header className="topbar"><label className="search"><Search size={17} /><input className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles, text, tags, technology…" /><kbd>/</kbd></label>
        <div className="toolbar">
          <select className="group-select" value={groupBy} onChange={(event) => setGroupBy(event.target.value as GroupAxis)} aria-label="Group by">
            <option value="purpose">Group: Purpose</option>
            <option value="where">Group: Where</option>
            <option value="techKind">Group: Tech</option>
            <option value="lifecycle">Group: Lifecycle</option>
          </select>
          <button className="icon-button" onClick={() => setLayout(layout === 'grid' ? 'list' : 'grid')} aria-label="Change layout">{layout === 'grid' ? <List /> : <Grid2X2 />}</button>
          <button className="scan-button" onClick={() => void scan()} disabled={scanning}><RefreshCw className={scanning ? 'spinning' : ''} size={16} /> {scanning ? progress : 'Rescan archive'}</button>
        </div></header>
      {showRoots && <div className="roots-panel"><div><p className="eyebrow">Approved locations</p><h2>Scan boundaries</h2></div><div>{roots.map((root) => <span key={root.path}><Folder size={14} />{shortPath(root.path)}<button onClick={async () => { await window.dashboardAPI?.removeRoot(root.path); setRoots((items) => items.filter((item) => item.path !== root.path)) }} aria-label={`Remove ${root.path}`}><X size={14} /></button></span>)}<button className="add-root" onClick={() => void addRoot()}><Plus size={15} /> Add folder</button></div></div>}
      <section className="archive-header"><div><p className="eyebrow">Personal web work / 2026</p><h1>{views.find((item) => item.id === view)?.label}</h1></div><div className="archive-count"><strong>{String(visible.length).padStart(2, '0')}</strong><span>visible works<br />from {roots.length} locations</span></div></section>
      {loading ? <div className="empty"><RefreshCw className="spinning" /><h2>Opening the archive</h2></div> : visible.length === 0 ? <div className="empty"><Archive /><h2>Nothing on this contact sheet</h2><p>{dashboards.length ? 'Try another view or search.' : roots.length ? 'Scan an approved folder to discover dashboards.' : 'Choose a folder to scan. No folders are scanned until you select them.'}</p>{!dashboards.length && (roots.length ? <button className="scan-button" onClick={() => void scan()}>Scan approved locations</button> : <button className="scan-button" onClick={() => void addRoot()}>Choose folder to start</button>)}</div> : layout === 'grid' ? <div className="contact-sheet">{grouped.flatMap(([label, items], groupIndex) => {
        const startIndex = grouped.slice(0, groupIndex).reduce((sum, [, prior]) => sum + prior.length, 0)
        return [
          <div className="grouphead" key={`head-${label}`}><h2>{facetLabel(label)}</h2><span className="n">{String(items.length).padStart(2, '0')}</span><span className="rule" /></div>,
          ...items.map((dashboard, offset) => <DashboardCard key={dashboard.id} dashboard={dashboard} index={startIndex + offset} onOpen={() => setSelectedId(dashboard.id)} />),
        ]
      })}</div> : <div className="list-view">{visible.map((dashboard, index) => <DashboardRow key={dashboard.id} dashboard={dashboard} index={index} onOpen={() => setSelectedId(dashboard.id)} />)}</div>}
    </section>
    {selected && <Detail dashboard={selected} onClose={() => setSelectedId(null)} onPatch={patchSelected} />}
  </main>
}
