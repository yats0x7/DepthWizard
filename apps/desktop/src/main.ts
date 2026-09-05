/**
 * Electron main process: starts the DepthWizard engine (FastAPI) as a child process on a free
 * port, waits for /api/health, then opens the studio UI served by the engine (or the Vite dev
 * server when DW_DEV_URL is set). Native dialogs and downloads go through the preload bridge.
 */
import { app, BrowserWindow, dialog, ipcMain, Menu, shell, nativeTheme } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { existsSync, mkdirSync, writeFileSync, createWriteStream } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import http from 'node:http'

const DEV_URL = process.env.DW_DEV_URL
const REPO_ROOT = join(__dirname, '..', '..', '..')
let engine: ChildProcess | null = null
let enginePort = 8000
let win: BrowserWindow | null = null
const logFile = join(app.getPath('userData'), 'engine.log')

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as { port: number }).port
      srv.close(() => resolve(port))
    })
    srv.on('error', reject)
  })
}

function engineCommand(): { cmd: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv } {
  const env = { ...process.env, DW_STATIC_DIR: join(REPO_ROOT, 'apps', 'studio', 'dist'), PYTHONUNBUFFERED: '1' }
  if (app.isPackaged) {
    // packaged: a self-contained engine folder next to the app resources (see electron-builder.yml)
    const bin = join(process.resourcesPath, 'engine', process.platform === 'win32' ? 'depthwizard.exe' : 'depthwizard')
    if (existsSync(bin)) {
      return { cmd: bin, args: ['serve', '--host', '127.0.0.1', '--port', String(enginePort)], cwd: dirname(bin), env: { ...env, DW_DATA_DIR: join(app.getPath('userData'), 'data'), DW_STATIC_DIR: join(process.resourcesPath, 'studio') } }
    }
  }
  return {
    cmd: 'uv',
    args: ['run', '--directory', join(REPO_ROOT, 'engine'), 'depthwizard', 'serve', '--host', '127.0.0.1', '--port', String(enginePort)],
    cwd: REPO_ROOT,
    env,
  }
}

function startEngine(): void {
  const { cmd, args, cwd, env } = engineCommand()
  mkdirSync(dirname(logFile), { recursive: true })
  const log = createWriteStream(logFile, { flags: 'a' })
  log.write(`\n[${new Date().toISOString()}] ${cmd} ${args.join(' ')}\n`)
  engine = spawn(cmd, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
  engine.stdout?.pipe(log)
  engine.stderr?.pipe(log)
  engine.on('exit', (code) => {
    log.write(`[engine exited ${code}]\n`)
    engine = null
    if (win && !win.isDestroyed() && code !== 0 && code !== null) {
      dialog.showErrorBox('DepthWizard engine stopped', `The processing engine exited with code ${code}. See ${logFile}`)
    }
  })
}

function waitForHealth(port: number, timeoutMs = 120_000): Promise<void> {
  const t0 = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/api/health', timeout: 1500 }, (res) => {
        res.resume()
        if (res.statusCode === 200) resolve()
        else retry()
      })
      req.on('error', retry)
      req.on('timeout', () => {
        req.destroy()
        retry()
      })
    }
    const retry = () => {
      if (Date.now() - t0 > timeoutMs) reject(new Error('engine did not start in time'))
      else setTimeout(tick, 400)
    }
    tick()
  })
}

function splash(): BrowserWindow {
  const w = new BrowserWindow({ width: 420, height: 260, frame: false, resizable: false, show: true, backgroundColor: '#0b1016', webPreferences: { sandbox: true } })
  const html = `<!doctype html><html><body style="margin:0;background:#0b1016;color:#e8edf2;font:14px Inter,system-ui;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:12px">
  <svg width="44" height="44" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#151d27"/><path d="M4 24 L11 12 L15 18 L20 8 L28 24 Z" fill="none" stroke="#22d3ee" stroke-width="2" stroke-linejoin="round"/><path d="M4 24 H28" stroke="#f5a524" stroke-width="2" stroke-linecap="round"/></svg>
  <div style="font-weight:600;font-size:18px;letter-spacing:-0.01em">DepthWizard</div><div style="color:#7f8fa1">Starting the engine and loading the depth model</div></body></html>`
  w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  return w
}

async function createWindow(): Promise<void> {
  nativeTheme.themeSource = 'dark'
  const s = splash()
  try {
    if (!DEV_URL) {
      enginePort = await freePort()
      startEngine()
      await waitForHealth(enginePort)
    } else {
      await waitForHealth(8000).catch(() => undefined)
    }
  } catch (e) {
    s.destroy()
    dialog.showErrorBox('DepthWizard', `${(e as Error).message}\n\nEngine log: ${logFile}`)
    app.quit()
    return
  }
  win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    backgroundColor: '#0b1016',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: { preload: join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false, nodeIntegration: false },
  })
  win.once('ready-to-show', () => {
    s.destroy()
    win?.show()
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) return { action: 'allow' }
    shell.openExternal(url)
    return { action: 'deny' }
  })
  const openJob = process.env.DW_OPEN_JOB ? `#job=${process.env.DW_OPEN_JOB}` : ''
  await win.loadURL((DEV_URL ?? `http://127.0.0.1:${enginePort}/`) + openJob)
  buildMenu()
  // Development only: DW_DEBUG_PORT starts a loopback HTTP server that captures screenshots
  // (GET /shot?file=/abs/path.png) and evaluates JavaScript in the page (POST /eval, body = code).
  if (process.env.DW_DEBUG_PORT && !app.isPackaged) {
    const srv = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        if (url.pathname === '/shot') {
          const file = url.searchParams.get('file')!
          const img = await win!.webContents.capturePage()
          writeFileSync(file, img.toPNG())
          res.writeHead(200).end(file)
        } else if (url.pathname === '/eval' && req.method === 'POST') {
          let body = ''
          req.on('data', (c) => (body += c))
          req.on('end', async () => {
            try {
              const out = await win!.webContents.executeJavaScript(`(async () => { ${body} })()`, true)
              res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(out ?? null))
            } catch (e) {
              res.writeHead(500).end(String(e))
            }
          })
        } else res.writeHead(404).end()
      } catch (e) {
        res.writeHead(500).end(String(e))
      }
    })
    srv.listen(Number(process.env.DW_DEBUG_PORT), '127.0.0.1')
  }
  // Headless verification: DW_SCREENSHOT=/path.png captures the window after DW_SCREENSHOT_DELAY ms and quits.
  if (process.env.DW_SCREENSHOT) {
    const delay = Number(process.env.DW_SCREENSHOT_DELAY ?? 15000)
    setTimeout(async () => {
      try {
        const img = await win!.webContents.capturePage()
        writeFileSync(process.env.DW_SCREENSHOT!, img.toPNG())
      } finally {
        app.quit()
      }
    }, delay)
  }
}

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open image…', accelerator: 'CmdOrCtrl+O', click: () => win?.webContents.send('dw:menu-open') },
        { type: 'separator' },
        { label: 'Engine log', click: () => shell.showItemInFolder(logFile) },
        { role: 'close' },
      ],
    },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { role: 'windowMenu' },
    { label: 'Help', submenu: [{ label: 'DepthWizard on GitHub', click: () => shell.openExternal('https://github.com/yats0x7/DepthWizard') }] },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

ipcMain.handle('dw:open-image', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Imagery', extensions: ['tif', 'tiff', 'geotiff', 'jp2', 'img', 'png', 'jpg', 'jpeg', 'webp'] }] })
  if (r.canceled || !r.filePaths[0]) return null
  return { name: basename(r.filePaths[0]), path: r.filePaths[0] }
})

ipcMain.handle('dw:submit-path', async (_e, path: string, opts: Record<string, unknown>) => {
  const port = DEV_URL ? 8000 : enginePort
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ path, ...opts })
    const req = http.request({ host: '127.0.0.1', port, path: '/api/jobs/from-path', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => {
        try {
          const j = JSON.parse(data)
          if (res.statusCode && res.statusCode < 300) resolve(j)
          else reject(new Error(j.detail ?? data))
        } catch {
          reject(new Error(data))
        }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
})

ipcMain.handle('dw:save-file', async (_e, url: string, suggestedName: string) => {
  const r = await dialog.showSaveDialog({ defaultPath: join(app.getPath('downloads'), suggestedName) })
  if (r.canceled || !r.filePath) return null
  const dest = r.filePath
  await new Promise<void>((resolve, reject) => {
    http.get(url, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`download failed (${res.statusCode})`))
      const out = createWriteStream(dest)
      res.pipe(out)
      out.on('finish', () => resolve())
      out.on('error', reject)
    }).on('error', reject)
  })
  return dest
})

ipcMain.handle('dw:reveal-job', async (_e, id: string) => {
  const dir = app.isPackaged ? join(app.getPath('userData'), 'data', 'jobs', id) : join(REPO_ROOT, 'data', 'jobs', id)
  if (existsSync(dir)) shell.openPath(dir)
})

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => {
  if (engine) {
    try {
      engine.kill()
    } catch {
      /* ignore */
    }
  }
})
process.on('exit', () => engine?.kill())
writeFileSync(join(app.getPath('userData'), 'last-start.txt'), new Date().toISOString())
