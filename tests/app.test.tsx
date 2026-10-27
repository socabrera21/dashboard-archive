import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App.tsx'
import type { Dashboard } from '../src/types.js'

const dashboard = (overrides: Partial<Dashboard> = {}): Dashboard => ({
  id: 'one', title: 'Dashboard Library', description: 'Personal project catalog', entryPath: '/Users/example/Documents/cockpit/index.html',
  projectRoot: '/Users/example/Documents/cockpit', location: 'local', kind: 'web-project', framework: 'React / Vite', status: 'ready',
  confidence: 0.95, fingerprint: 'one', modifiedAt: Date.now(), createdAt: Date.now(), headings: ['Pipeline'], links: 4,
  textContent: 'saved dashboards and websites', scripts: { dev: 'vite' }, dependencies: ['react'], tags: ['sample'], note: '',
  favorite: false, improvementStatus: 'none', purpose: 'cockpit', where: 'documents', lifecycle: 'live', ...overrides,
})

describe('dashboard archive interface', () => {
  let catalogListener: ((items: Dashboard[]) => void) | undefined
  beforeEach(() => {
    catalogListener = undefined
    window.dashboardAPI = {
      list: vi.fn().mockResolvedValue([dashboard(), dashboard({ id: 'two', title: 'Needs Review', status: 'review', entryPath: '/Users/example/Documents/review.html' })]),
      scan: vi.fn().mockResolvedValue({ dashboards: [], scannedFiles: 0, skippedFiles: 0, errors: [] }),
      getRoots: vi.fn().mockResolvedValue([]), chooseRoot: vi.fn(), removeRoot: vi.fn(), update: vi.fn().mockImplementation(async (_id, patch) => dashboard(patch)),
      open: vi.fn(), reveal: vi.fn(), openEditor: vi.fn(), copyPath: vi.fn(), revealPath: vi.fn(), thumbnail: vi.fn().mockResolvedValue(null), onScanProgress: vi.fn().mockReturnValue(() => {}),
      onCatalogChanged: vi.fn().mockImplementation((callback) => { catalogListener = callback; return () => {} }),
    }
  })

  it('loads the archive and filters it with search', async () => {
    render(<App />)
    expect(await screen.findByText('Dashboard Library')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText(/search titles/i), { target: { value: 'review' } })
    expect(screen.queryByText('Dashboard Library')).not.toBeInTheDocument()
    expect(screen.getByText('Needs Review')).toBeInTheDocument()
  })

  it('waits for a folder choice before scanning a fresh install', async () => {
    window.dashboardAPI!.list = vi.fn().mockResolvedValue([])
    window.dashboardAPI!.chooseRoot = vi.fn().mockResolvedValue({ path: '/Users/example/Documents/sample', enabled: true })
    window.dashboardAPI!.scan = vi.fn().mockResolvedValue({ dashboards: [dashboard()], scannedFiles: 1, skippedFiles: 0, errors: [] })

    render(<App />)
    const chooseFolder = await screen.findByRole('button', { name: 'Choose folder to start' })
    expect(window.dashboardAPI?.scan).not.toHaveBeenCalled()

    fireEvent.click(chooseFolder)

    expect(await screen.findByText('Dashboard Library')).toBeInTheDocument()
    expect(window.dashboardAPI?.chooseRoot).toHaveBeenCalledOnce()
    expect(window.dashboardAPI?.scan).toHaveBeenCalledOnce()
  })

  it('opens a detail workspace and saves favorite state', async () => {
    render(<App />)
    fireEvent.click(await screen.findByText('Dashboard Library'))
    expect(screen.getByRole('dialog')).toHaveTextContent('Pipeline')
    fireEvent.click(screen.getByRole('button', { name: /add to favorites/i }))
    await waitFor(() => expect(window.dashboardAPI?.update).toHaveBeenCalledWith('one', { favorite: true }))
  })

  it('shows only uncertain discoveries in review view', async () => {
    render(<App />); await screen.findByText('Dashboard Library')
    fireEvent.click(screen.getByRole('button', { name: /filter: needs review/i }))
    expect(screen.queryByText('Dashboard Library')).not.toBeInTheDocument()
    expect(screen.getByText('Needs Review')).toBeInTheDocument()
  })

  it('updates progressively as background scan roots complete', async () => {
    render(<App />); await screen.findByText('Dashboard Library')
    catalogListener?.([dashboard({ id: 'fresh', title: 'Freshly Discovered' })])
    expect(await screen.findByText('Freshly Discovered')).toBeInTheDocument()
  })

  it('filters by a purpose facet', async () => {
    window.dashboardAPI!.list = vi.fn().mockResolvedValue([
      dashboard({ id: 'a', title: 'Dashboard Library', purpose: 'cockpit' }),
      dashboard({ id: 'b', title: 'Playbook Page', purpose: 'playbook', entryPath: '/Users/example/Documents/playbook.html' }),
    ])
    render(<App />)
    await screen.findByText('Dashboard Library')
    expect(screen.getByText('Playbook Page')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cockpit' }))
    expect(screen.getByText('Dashboard Library')).toBeInTheDocument()
    expect(screen.queryByText('Playbook Page')).not.toBeInTheDocument()
  })

  it('renders grouped section headers with correct labels and counts', async () => {
    window.dashboardAPI!.list = vi.fn().mockResolvedValue([
      dashboard({ id: 'a', title: 'Dashboard Library', purpose: 'cockpit' }),
      dashboard({ id: 'b', title: 'Playbook Page', purpose: 'playbook', entryPath: '/Users/example/Documents/playbook.html' }),
      dashboard({ id: 'c', title: 'Icloud Cockpit', purpose: 'cockpit', entryPath: '/Users/example/Documents/icloud-cockpit.html' }),
    ])
    const { container } = render(<App />)
    await screen.findByText('Dashboard Library')

    const heads = Array.from(container.querySelectorAll('.grouphead')).map((head) => [
      head.querySelector('h2')?.textContent,
      head.querySelector('.n')?.textContent,
    ])
    expect(heads).toEqual(expect.arrayContaining([
      ['Cockpit', '02'],
      ['Playbook', '01'],
    ]))
  })

  it('re-partitions the sheet under different section headers when the group-by axis changes', async () => {
    window.dashboardAPI!.list = vi.fn().mockResolvedValue([
      dashboard({ id: 'a', title: 'Dashboard Library', purpose: 'cockpit', where: 'documents' }),
      dashboard({ id: 'b', title: 'Playbook Page', purpose: 'playbook', where: 'documents', entryPath: '/Users/example/Documents/playbook.html' }),
      dashboard({ id: 'c', title: 'Icloud Battlecard', purpose: 'battlecard', where: 'icloud', entryPath: '/Users/example/Documents/icloud-battlecard.html' }),
    ])
    const { container } = render(<App />)
    await screen.findByText('Dashboard Library')

    const purposeHeads = Array.from(container.querySelectorAll('.grouphead h2')).map((head) => head.textContent)
    expect(purposeHeads).toEqual(expect.arrayContaining(['Cockpit', 'Playbook', 'Battlecard']))

    fireEvent.change(screen.getByRole('combobox', { name: /group by/i }), { target: { value: 'where' } })

    const whereHeads = Array.from(container.querySelectorAll('.grouphead')).map((head) => [
      head.querySelector('h2')?.textContent,
      head.querySelector('.n')?.textContent,
    ])
    expect(whereHeads).toEqual(expect.arrayContaining([
      ['Documents', '02'],
      ['Icloud', '01'],
    ]))
  })

  it('ORs multiple chips selected within the same facet group', async () => {
    window.dashboardAPI!.list = vi.fn().mockResolvedValue([
      dashboard({ id: 'a', title: 'Dashboard Library', purpose: 'cockpit' }),
      dashboard({ id: 'b', title: 'Playbook Page', purpose: 'playbook', entryPath: '/Users/example/Documents/playbook.html' }),
      dashboard({ id: 'c', title: 'Battle Vault', purpose: 'battlecard', entryPath: '/Users/example/Documents/battle-vault.html' }),
    ])
    render(<App />)
    await screen.findByText('Dashboard Library')

    fireEvent.click(screen.getByRole('button', { name: 'Cockpit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Playbook' }))

    expect(screen.getByText('Dashboard Library')).toBeInTheDocument()
    expect(screen.getByText('Playbook Page')).toBeInTheDocument()
    expect(screen.queryByText('Battle Vault')).not.toBeInTheDocument()
  })

  it('ANDs chips selected from different facet groups', async () => {
    window.dashboardAPI!.list = vi.fn().mockResolvedValue([
      dashboard({ id: 'a', title: 'Documents Cockpit', purpose: 'cockpit', where: 'documents' }),
      dashboard({ id: 'b', title: 'Icloud Cockpit', purpose: 'cockpit', where: 'icloud', entryPath: '/Users/example/Documents/icloud-cockpit.html' }),
      dashboard({ id: 'c', title: 'Documents Playbook', purpose: 'playbook', where: 'documents', entryPath: '/Users/example/Documents/documents-playbook.html' }),
    ])
    render(<App />)
    await screen.findByText('Documents Cockpit')

    fireEvent.click(screen.getByRole('button', { name: 'Cockpit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Icloud' }))

    expect(screen.getByText('Icloud Cockpit')).toBeInTheDocument()
    expect(screen.queryByText('Documents Cockpit')).not.toBeInTheDocument()
    expect(screen.queryByText('Documents Playbook')).not.toBeInTheDocument()
  })

  it('shows a copies badge and lists mirror paths in the detail panel', async () => {
    window.dashboardAPI!.list = vi.fn().mockResolvedValue([
      dashboard({ id: 'a', title: 'Dashboard Library', mirrorPaths: ['/Users/example/Desktop/Duplicate/cockpit/index.html'] }),
    ])
    window.dashboardAPI!.revealPath = vi.fn()
    render(<App />)
    await screen.findByText('Dashboard Library')
    expect(screen.getByText('2 copies')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Dashboard Library'))
    expect(screen.getByText('/Users/example/Desktop/Duplicate/cockpit/index.html')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /reveal copy/i }))
    expect(window.dashboardAPI?.revealPath).toHaveBeenCalledWith('/Users/example/Desktop/Duplicate/cockpit/index.html')
  })
})
