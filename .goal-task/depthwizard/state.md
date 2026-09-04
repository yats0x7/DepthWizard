# DepthWizard - execution state

Status: active (restarted 2026-09-05 after Electron decision) | Phase: 5 (verification + packaging) | Mode: deep

## Active truth
- `/goal` (rendered 2026-09-05) - outcome and gates
- `PROBLEM_STATEMENT.md` - ISRO problem statement 26175, authoritative requirements
- `OPEN_SOURCE_LANDSCAPE.md` - component choices and glue architecture
- `.goal-task/depthwizard/design.md` - confirmed design decisions
- `.goal-task/depthwizard/todo.md` - work items

## Baseline (2026-09-05)
- Repo: Depth-Wizard worktree, branch `claude/sih-problem-form-0473e6`, clean apart from docs.
- Machine: Apple M4, 16 GB RAM, macOS. torch 2.10 with MPS, transformers 5.1, uv 0.11, node 24, pnpm 11. No GDAL CLI, no rasterio yet.
- No existing source code. `Documents/Dineo_both` is an unrelated submodule; leave untouched.

## Execution contract
- Retry an item at most 3 times, then record and defer; continue independent work.
- Progress line after each productive loop: gates-based percentage.
- Independent review: 3 read-only reviewers at the final milestone (correctness/tests, design/boundaries, security/maintainability).
- Commit locally after each milestone passes its checks. No push without authorization.
- Model weights are downloaded from Hugging Face on first run; keep weights out of git.

## Gates
1. Backend pipeline: PNG/JPG -> rDSM, GeoTIFF -> metric DSM (SRTM-calibrated), GeoTIFF + GLB + PNG outputs. Unit tests pass.
2. API: FastAPI upload -> job -> results, validation endpoint with RMSE/MAE/r.
3. Frontend: upload, 3D viewer with first-person flythrough, height probe, slope, flood, profile, validation panel. Builds with no type errors.
4. Standalone: Docker compose for the stack plus an Electron desktop app that launches the API and opens the UI.
5. Docs: README with setup, architecture, evaluation instructions.
6. Independent review complete, no unresolved high-severity finding.

## Decisions since start
- Desktop wrapper is Electron, not Tauri (user decision). Remove desktop/src-tauri.
- Real Landsat run exposed nodata halos and unbounded prior scaling; fixed in calibrate/fit.py, tests still pass.
- Sample data: backend/data/samples/landsat_rgb.tif (flat Bahamas scene, weak demo) and oam_urban.tif (3 cm drone crop, Dar es Salaam, EPSG:32737, good demo).

## Progress
- Gate 1 backend: 14 tests pass. Gate 2 API: done. Gate 3 frontend: builds clean, browser check pending. Gate 4 packaging: Docker written, Electron pending. Gate 5 README: written. Gate 6 review: pending.
- GitHub: private repo yats0x7/DepthWizard, branch main. Commits carry no AI attribution (user rule).

## Next action
Replace desktop/ with the Electron app, run the urban sample, drive the web app in the browser and fix issues, commit, then 3 independent reviews.
