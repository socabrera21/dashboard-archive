import { contextBridge, ipcRenderer } from 'electron'
import type { CatalogPatch, DashboardAPI } from '../src/types.js'

const api: DashboardAPI = {
  list: () => ipcRenderer.invoke('catalog:list'),
  scan: () => ipcRenderer.invoke('catalog:scan'),
  getRoots: () => ipcRenderer.invoke('roots:list'),
  chooseRoot: () => ipcRenderer.invoke('roots:choose'),
  removeRoot: (path) => ipcRenderer.invoke('roots:remove', path),
  update: (id, patch: CatalogPatch) => ipcRenderer.invoke('catalog:update', id, patch),
  open: (id) => ipcRenderer.invoke('dashboard:open', id),
  reveal: (id) => ipcRenderer.invoke('dashboard:reveal', id),
  openEditor: (id) => ipcRenderer.invoke('dashboard:editor', id),
  copyPath: (id) => ipcRenderer.invoke('dashboard:copy-path', id),
  revealPath: (path) => ipcRenderer.invoke('dashboard:reveal-path', path),
  thumbnail: (id) => ipcRenderer.invoke('dashboard:thumbnail', id),
  onScanProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string) => callback(message)
    ipcRenderer.on('scan:progress', listener)
    return () => ipcRenderer.removeListener('scan:progress', listener)
  },
  onCatalogChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, dashboards: Parameters<typeof callback>[0]) => callback(dashboards)
    ipcRenderer.on('catalog:changed', listener)
    return () => ipcRenderer.removeListener('catalog:changed', listener)
  },
}

contextBridge.exposeInMainWorld('dashboardAPI', api)
