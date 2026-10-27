import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import { existsSync, mkdirSync, watch } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { Catalog } from './catalog.js'
import { scanRoots } from './discovery.js'
import { requireDashboardPath } from './security.js'
import type { CatalogPatch } from '../src/types.js'

let mainWindow: BrowserWindow | null = null
let catalog: Catalog
let scanRunning: Promise<unknown> | null = null
let quitting = false
const watchers: Array<ReturnType<typeof watch>> = []

function approvedRoots() { return catalog.roots().filter((root) => root.enabled).map((root) => root.path) }
function dashboardPath(id: string, project = false) {
  const item = catalog.get(id); if (!item) throw new Error('Dashboard not found')
  return requireDashboardPath(project ? item.projectRoot : item.entryPath, approvedRoots())
}

async function runScan() {
  if (scanRunning) return scanRunning
  if (quitting) return { dashboards: [], scannedFiles: 0, skippedFiles: 0, errors: [] }
  scanRunning = (async () => {
    const combined = { dashboards: [] as Awaited<ReturnType<typeof scanRoots>>['dashboards'], scannedFiles: 0, skippedFiles: 0, errors: [] as string[] }
    for (const root of approvedRoots()) {
      if (quitting) break
      const result = await scanRoots([root], (message) => { if (!mainWindow?.isDestroyed()) mainWindow?.webContents.send('scan:progress', message) })
      if (quitting) break
      combined.dashboards.push(...result.dashboards); combined.scannedFiles += result.scannedFiles; combined.skippedFiles += result.skippedFiles; combined.errors.push(...result.errors)
      catalog.upsertDashboards(result.dashboards)
      if (!mainWindow?.isDestroyed()) mainWindow?.webContents.send('catalog:changed', catalog.list())
    }
    if (quitting) return combined
    catalog.markMissing(new Set(combined.dashboards.map((item) => item.id))); catalog.touchRoots()
    const dashboards = catalog.list(); if (!mainWindow?.isDestroyed()) mainWindow?.webContents.send('catalog:changed', dashboards)
    return { ...combined, dashboards }
  })()
    .catch((error) => { console.error('[dashboard-archive] scan failed:', error); return { dashboards: [], scannedFiles: 0, skippedFiles: 0, errors: [String(error)] } })
    .finally(() => { scanRunning = null })
  return scanRunning
}

function setupWatchers() {
  watchers.splice(0).forEach((entry) => entry.close())
  let timer: ReturnType<typeof setTimeout> | undefined
  for (const root of approvedRoots()) {
    try {
      watchers.push(watch(root, { recursive: true }, (_event, filename) => {
        if (!filename?.toLowerCase().endsWith('.html') && filename !== 'package.json') return
        clearTimeout(timer); timer = setTimeout(() => { runScan().catch((error) => console.error('[dashboard-archive] watcher-triggered scan failed:', error)) }, 1500)
      }))
    } catch { /* An unavailable iCloud root remains manually scannable. */ }
  }
}

async function captureThumbnail(id: string): Promise<string | null> {
  const item = catalog.get(id); if (!item || item.status === 'missing') return null
  const entry = dashboardPath(id)
  const cacheDir = path.join(app.getPath('userData'), 'thumbnails'); mkdirSync(cacheDir, { recursive: true })
  const cachePath = path.join(cacheDir, `${item.id}-${Math.floor(item.modifiedAt)}.png`)
  if (existsSync(cachePath)) return `data:image/png;base64,${(await fs.readFile(cachePath)).toString('base64')}`
  const preview = new BrowserWindow({ show: false, width: 1000, height: 625, webPreferences: { javascript: false, nodeIntegration: false, contextIsolation: true } })
  try {
    await Promise.race([preview.loadFile(entry), new Promise((_, reject) => setTimeout(() => reject(new Error('Preview timeout')), 8000))])
    const image = await preview.webContents.capturePage(); await fs.writeFile(cachePath, image.toPNG())
    return image.toDataURL()
  } catch { return null } finally { preview.destroy() }
}

function registerIpc() {
  ipcMain.handle('catalog:list', () => catalog.list())
  ipcMain.handle('catalog:scan', () => runScan())
  ipcMain.handle('catalog:update', (_event, id: string, patch: CatalogPatch) => catalog.update(id, patch))
  ipcMain.handle('roots:list', () => catalog.roots())
  ipcMain.handle('roots:choose', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] }); if (result.canceled || !result.filePaths[0]) return null
    catalog.addRoot(result.filePaths[0]); setupWatchers(); return catalog.roots().find((root) => root.path === result.filePaths[0])
  })
  ipcMain.handle('roots:remove', (_event, root: string) => { catalog.removeRoot(root); setupWatchers() })
  ipcMain.handle('dashboard:open', (_event, id: string) => shell.openPath(dashboardPath(id)))
  ipcMain.handle('dashboard:reveal', (_event, id: string) => shell.showItemInFolder(dashboardPath(id)))
  ipcMain.handle('dashboard:copy-path', (_event, id: string) => clipboard.writeText(dashboardPath(id)))
  ipcMain.handle('dashboard:reveal-path', (_event, target: string) => shell.showItemInFolder(requireDashboardPath(target, approvedRoots())))
  ipcMain.handle('dashboard:editor', async (_event, id: string) => {
    const project = dashboardPath(id, true)
    const child = spawn('open', ['-a', 'Visual Studio Code', project], { stdio: 'ignore' })
    child.once('error', () => void shell.openPath(project)); child.unref()
  })
  ipcMain.handle('dashboard:thumbnail', (_event, id: string) => captureThumbnail(id))
}

async function loadWithRetry(win: BrowserWindow, devUrl: string, attempts = 3, delayMs = 500): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await win.loadURL(devUrl)
      return
    } catch (error) {
      if (attempt === attempts) {
        console.error(`[dashboard-archive] dev server load failed after ${attempts} attempts:`, error)
        return
      }
      console.warn(`[dashboard-archive] dev server load attempt ${attempt} failed, retrying in ${delayMs}ms:`, error)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500, height: 940, minWidth: 1050, minHeight: 680, backgroundColor: '#11120f', titleBarStyle: 'hiddenInset',
    webPreferences: { preload: path.join(import.meta.dirname, 'preload.mjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  if (process.env.VITE_DEV_SERVER_URL) await loadWithRetry(mainWindow, process.env.VITE_DEV_SERVER_URL)
  else await mainWindow.loadFile(path.join(import.meta.dirname, '../dist/index.html')).catch((error) => console.error('[dashboard-archive] loadFile failed:', error))
}

app.whenReady().then(async () => {
  const dataDir = app.getPath('userData'); mkdirSync(dataDir, { recursive: true }); catalog = new Catalog(path.join(dataDir, 'catalog.sqlite'))
  registerIpc(); setupWatchers(); await createWindow(); runScan().catch((error) => console.error('[dashboard-archive] initial scan failed:', error))
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', () => { quitting = true; watchers.forEach((entry) => entry.close()); catalog?.close() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow() })
