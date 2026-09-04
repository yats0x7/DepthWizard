# DepthWizard - execution state

Status: active | Phase: 1 (scaffold) | Mode: deep

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
4. Standalone: Docker compose for the stack plus Tauri/Electron desktop wrapper config.
5. Docs: README with setup, architecture, evaluation instructions.
6. Independent review complete, no unresolved high-severity finding.

## Next action
Scaffold backend (uv) and frontend (Vite + React + TS).
