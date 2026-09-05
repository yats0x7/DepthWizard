# DepthWizard - execution state

Status: active (fresh rebuild started 2026-09-05 on user request) | Phase: verification | Mode: deep

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

## Next action
Confirm the Electron screenshot of the urban job in Presentation mode, fix lighting/sky issues,
exercise the analysis tools, commit and push, then run the three reviews.
