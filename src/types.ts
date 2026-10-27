export type DashboardStatus = 'ready' | 'review' | 'missing' | 'icloud'
export type ImprovementStatus = 'none' | 'planned' | 'in-progress' | 'complete'
export type Purpose = 'cockpit' | 'talk-track' | 'playbook' | 'battlecard' | 'one-pager' | 'experiment' | 'tooling' | 'uncategorized'
export type Where = 'vault' | 'documents' | 'icloud' | 'desktop'
export type Lifecycle = 'live' | 'draft' | 'archived'

export interface Dashboard {
  id: string
  title: string
  description: string
  entryPath: string
  projectRoot: string
  location: 'local' | 'icloud'
  kind: 'standalone-html' | 'web-project'
  framework: string
  status: DashboardStatus
  confidence: number
  fingerprint: string
  modifiedAt: number
  createdAt: number
  headings: string[]
  links: number
  textContent: string
  scripts: Record<string, string>
  dependencies: string[]
  tags: string[]
  note: string
  favorite: boolean
  improvementStatus: ImprovementStatus
  purpose: Purpose
  where: Where
  lifecycle: Lifecycle
  duplicateOf?: string
  versionLabel?: string
  thumbnailUrl?: string
  mirrorPaths?: string[]
  fileCount?: number
}

export interface ScanRoot { path: string; enabled: boolean; lastScannedAt?: number }
export interface ScanResult { dashboards: Dashboard[]; scannedFiles: number; skippedFiles: number; errors: string[] }
export interface CatalogPatch { note?: string; tags?: string[]; favorite?: boolean; improvementStatus?: ImprovementStatus }

export interface DashboardAPI {
  list(): Promise<Dashboard[]>
  scan(): Promise<ScanResult>
  getRoots(): Promise<ScanRoot[]>
  chooseRoot(): Promise<ScanRoot | null>
  removeRoot(path: string): Promise<void>
  update(id: string, patch: CatalogPatch): Promise<Dashboard>
  open(id: string): Promise<void>
  reveal(id: string): Promise<void>
  openEditor(id: string): Promise<void>
  copyPath(id: string): Promise<void>
  revealPath(path: string): Promise<void>
  thumbnail(id: string): Promise<string | null>
  onScanProgress(callback: (message: string) => void): () => void
  onCatalogChanged(callback: (dashboards: Dashboard[]) => void): () => void
}

declare global { interface Window { dashboardAPI?: DashboardAPI } }
