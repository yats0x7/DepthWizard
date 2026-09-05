# DepthWizard desktop

Electron shell around the engine and the studio.

- `pnpm start` builds the main process and launches Electron. The main process starts
  `uv run depthwizard serve` on a free port, waits for `/api/health`, then loads the studio that the
  engine serves from `apps/studio/dist` (run `pnpm studio:build` at the repo root first).
- `pnpm dev` loads the Vite dev server (`http://127.0.0.1:5174`) instead and expects the engine on
  port 8000 (`pnpm engine` at the repo root).
- `pnpm dist` packages the app with electron-builder. For a self-contained installer build the
  engine into `engine/build/depthwizard` first (PyInstaller, see the root README); without it the
  packaged app falls back to `uv` on the PATH.

The shell generates a per-launch token, passes it to the engine as `DW_DESKTOP_TOKEN`, and sends it
with local-path submissions; in `pnpm dev` set the same `DW_DESKTOP_TOKEN` when starting the engine.

Engine output is written to `engine.log` in the app's user-data folder (File > Engine log).
