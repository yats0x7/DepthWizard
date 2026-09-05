# DepthWizard - execution state

Status: review fixes applied, final commit pending | Phase: closing | Mode: deep

## Active truth
- `docs/PROBLEM_STATEMENT.md` - ISRO problem statement 26175, authoritative requirements
- `docs/OPEN_SOURCE_LANDSCAPE.md` - inspiration only; nothing is wired in from third-party viewers
- `.goal-task/depthwizard/design.md` - confirmed design decisions for the rebuild
- `.goal-task/depthwizard/todo.md` - work items

## Baseline
- Worktree branch `claude/sih-problem-form-0473e6`; remote `depthwizard` = yats0x7/DepthWizard, push
  with `git push depthwizard HEAD:main`. Commits carry no AI attribution (user rule).
- Machine: Apple M4 16 GB, torch 2.14 MPS, transformers 5.16, uv 0.11, node 24, pnpm 11.
- Old code (backend/, frontend/, desktop/, docker/) deleted; docs moved to docs/; data in data/.
- Dev servers: `.claude/launch.json` engine (8000) and studio (5174). The embedded preview browser
  runs WebGL in software (1-5 fps) so visual checks of the 3D scene use the Electron screenshot mode.

## Execution contract
- Retry an item at most 3 times, then record and defer; continue independent work.
- Independent review: 3 read-only reviewers at the final milestone.
- Commit after each milestone passes its checks; push to the private remote when a milestone is done.

## Gates
1. Engine: PNG/JPG -> rDSM, GeoTIFF -> metric DSM, outputs, tests green. DONE.
2. API: jobs, SSE progress, validate, recalibrate, samples. DONE.
3. Studio: upload, Presentation/Analysis toggle, fly/walk, probe, profile, flood, GCPs,
   validation, exports; typechecks and builds. Built; browser verification in progress.
4. Desktop + Docker. Written; Electron smoke test in progress.
5. README + pitch deck brief. DONE.
6. Independent review. Pending.

## Review outcome (2026-09-05)
All three reviews returned; every high and medium finding was fixed and covered by tests where the
engine was involved (33 tests). Remaining low items deliberately left: Docker uses CPU wheels outside
the lockfile (documented), the dev-only debug server has no token (never enabled in packaged builds).

## Next action
Commit and push the review fixes; then optional: PyInstaller freeze of the engine for a
self-contained installer, and a vitest suite for apps/studio/src/lib/terrain.ts.
