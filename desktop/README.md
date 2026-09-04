# DepthWizard desktop (Electron)

`src/main.js` starts the Python API (`depthwizard serve`) as a child process, waits for `/api/health`, and opens the web app served by that API. Jobs and model weights live in the OS user-data folder.

## Run from the repo (development)

```bash
cd frontend && pnpm build          # the API serves frontend/dist
cd ../desktop && pnpm install && pnpm start
```

`pnpm dev` loads the Vite dev server (http://localhost:5173) instead, for hot reload.

## Build installers

1. Freeze the API so end users need no Python:
   ```bash
   cd backend && uv run --with pyinstaller pyinstaller --onedir --name depthwizard-api --collect-all rasterio --collect-all transformers -m depthwizard.cli
   ```
   That produces `backend/dist/depthwizard-api/`, which `electron-builder.yml` copies into the app resources.
2. Convert `build/icon.svg` to `build/icon.png` (1024×1024).
3. `pnpm dist` (or `dist:mac`, `dist:win`, `dist:linux`). Installers land in `desktop/release/`.

When the frozen API is missing, the packaged app falls back to `uv run depthwizard serve` from the repo, which is what development uses.
