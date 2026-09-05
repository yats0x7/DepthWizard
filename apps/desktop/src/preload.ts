import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('depthwizard', {
  isDesktop: true,
  platform: process.platform,
  version: process.env.DW_VERSION ?? '1.0.0',
  saveFile: (url: string, suggestedName: string) => ipcRenderer.invoke('dw:save-file', url, suggestedName),
  openImage: () => ipcRenderer.invoke('dw:open-image'),
  submitPath: (path: string, opts: Record<string, unknown>) => ipcRenderer.invoke('dw:submit-path', path, opts),
  revealJob: (id: string) => ipcRenderer.invoke('dw:reveal-job', id),
})
