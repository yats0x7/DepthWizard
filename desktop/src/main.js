// DepthWizard desktop: starts the Python API as a child process and opens the web UI on it.
const { app, BrowserWindow, dialog, shell } = require('electron')
const { spawn } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')
const http = require('node:http')

const PORT = Number(process.env.DW_PORT || 8765)
const DEV = !!process.env.DW_DEV
let api = null
let win = null

function resourcesDir() { return app.isPackaged ? process.resourcesPath : path.join(__dirname, '..') }

/** Pick the API launcher: frozen binary in resources/api, else `uv run depthwizard serve` from the repo. */
function apiCommand() {
  const bin = path.join(resourcesDir(), 'api', process.platform === 'win32' ? 'depthwizard-api.exe' : 'depthwizard-api')
  if (fs.existsSync(bin)) return { cmd: bin, args: ['serve', '--host', '127.0.0.1', '--port', String(PORT)], cwd: path.dirname(bin) }
  const backend = path.join(__dirname, '..', '..', 'backend')
  return { cmd: 'uv', args: ['run', 'depthwizard', 'serve', '--host', '127.0.0.1', '--port', String(PORT)], cwd: backend }
}

function startApi() {
  const { cmd, args, cwd } = apiCommand()
  const staticDir = app.isPackaged ? path.join(resourcesDir(), 'web') : path.join(__dirname, '..', '..', 'frontend', 'dist')
  const env = { ...process.env, DW_STATIC_DIR: staticDir, DW_DATA_DIR: path.join(app.getPath('userData'), 'data'), HF_HOME: path.join(app.getPath('userData'), 'models') }
  api = spawn(cmd, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
  api.stdout.on('data', (d) => process.stdout.write(`[api] ${d}`))
  api.stderr.on('data', (d) => process.stderr.write(`[api] ${d}`))
  api.on('exit', (code) => { if (code && !app.isQuitting) dialog.showErrorBox('DepthWizard API stopped', `The backend exited with code ${code}. See the log for details.`) })
}

function waitForApi(timeoutMs = 120000) {
  const t0 = Date.now()
  return new Promise((resolve, reject) => {
    const retry = () => (Date.now() - t0 > timeoutMs ? reject(new Error('API did not start')) : setTimeout(tick, 500))
    const tick = () => {
      http.get({ host: '127.0.0.1', port: PORT, path: '/api/health', timeout: 2000 }, (res) => {
        res.resume()
        if (res.statusCode === 200) resolve(); else retry()
      }).on('error', retry)
    }
    tick()
  })
}

function splash() {
  const s = new BrowserWindow({ width: 420, height: 240, frame: false, resizable: false, backgroundColor: '#0b0f14', show: true })
  s.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<body style="margin:0;background:#0b0f14;color:#e6edf3;font:14px system-ui;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:10px">
    <div style="font-size:22px;font-weight:600;background:linear-gradient(90deg,#22d3ee,#6366f1);-webkit-background-clip:text;color:transparent">DepthWizard</div>
    <div style="color:#8b9bb0">Starting the elevation engine…</div>
    <div style="color:#8b9bb0;font-size:12px">First launch downloads model weights.</div></body>`))
  return s
}

async function createWindow() {
  const s = splash()
  startApi()
  try { await waitForApi() } catch (e) { dialog.showErrorBox('DepthWizard', e.message); app.quit(); return }
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 640, backgroundColor: '#0b0f14', show: false,
    title: 'DepthWizard', webPreferences: { contextIsolation: true, sandbox: true },
  })
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } })
  await win.loadURL(DEV ? 'http://localhost:5173' : `http://127.0.0.1:${PORT}/`)
  win.show()
  s.close()
}

app.whenReady().then(createWindow)
app.on('before-quit', () => { app.isQuitting = true; if (api) api.kill() })
app.on('window-all-closed', () => app.quit())
