# Repo top-level cleanup, 2026-10-05

Decision key: REMOVED (tracked, uncommitted ` D`, restore with `git checkout -- <path>`), TRASH (moved to `~/.Trash/Amar_school_LMS-cleanup-2026-10-05/`), KEPT, ASK.

| Item | What it is | Refs found | Regenerable? | jev (verify) | Decision | Size |
|---|---|---|---|---|---|---|
| `.DS_Store` x4 (root, ui/, docs/, graphify-out/cache/) | Finder metadata | none | yes (Finder) | n/a | DELETED outright | 12K+ |
| `s-home.png` | root screenshot, ignored by `/*.png` | 0 | yes | verified 0.88 | TRASH | 96K |
| `node_modules/` (root) | only `.vite` cache, no root package.json | 0 | yes | verified 0.96 | TRASH | 4K |
| `.playwright-mcp/` | Playwright MCP scratch logs/snapshots, gitignored | .gitignore only; no open handles | yes | verified 0.99 | TRASH | 21M |
| `dashboard-desktop.png` | stray root screenshot (2026) | 0 | yes | verified 0.91 | REMOVED | 88K |
| `docs.code-workspace` | VS Code workspace with Windows paths (C:/Users/81250/...) | 0 | hand-made, stale | verified 0.96 | REMOVED | 4K |
| `figma/` (6 files) | hand-written SVG mockups for Figma import, 2026-07-05 | 0 | hand-made, superseded by web/ and ui/ | verified 0.92 | REMOVED | 56K |
| `handsoff/` (2 files) | MVP-build agent handoff + ticket log, 2026-07 | 0 | hand-made, stale (docs/handoff/ is the live home) | verified 0.96 | REMOVED | 16K |
| `home.yml`, `routes.txt` | Playwright snapshot and route dump of the legacy "eduman" app (2026-08-02) | 0 | hand-captured | verified 0.75 (below 0.8) | KEPT / ASK | 92K |
| `ui/` (147 tracked) | static HTML prototypes; served by GitHub Pages; cited in web/ comments (fees/actions.ts, lib/grace.ts, lib/attendance-manual.ts) | 3+ comments | hand-made | contradicted | KEPT / ASK | 1.7M |
| `index.html`, `.nojekyll` | Pages entry redirecting to `ui/sitemap.html`; Pages source is main:/ , status built | Pages config | hand-made | contradicted 0.99 | KEPT | small |
| `graphify-out/` (458 tracked) | graphify knowledge graph output; used by the /graphify skill and settings.local.json | .claude | regenerable via /graphify | not run, skill depends on it | KEPT / ASK | 7.5M |
| `Design System/` | owner reorganising | n/a | n/a | not evaluated | KEPT (untouched) | 41M |
| `docs/` unprotected specs (001-013, PRD*, master_prd, ARCHITECTURE, ui, ux-*, improvement, images, research/) | hand-made specs; most referenced by web/ code, migrations or other docs | see report | unique | not run | KEPT | 3.5M |
| Never-touch list (web, .claude, .agents, .mcp.json, skills-lock.json, CONTEXT.md, README.md, docs/adr|handoff|testing) | | | | | KEPT | |

## Restore
- `git checkout -- dashboard-desktop.png docs.code-workspace figma handsoff`
- Trash items: `mv ~/.Trash/Amar_school_LMS-cleanup-2026-10-05/<name> .`

## ASK OWNER
- `home.yml routes.txt`: legacy eduman captures, unreferenced; `rm -f home.yml routes.txt`
- `ui/`: only if you retire the GitHub Pages prototype site and accept losing the `ui/...html` comment targets in web/; then also index.html and .nojekyll.
- `graphify-out/`: `rm -rf graphify-out` if you stop using /graphify (regenerable).
- Unreferenced docs: `docs/010_exam_system.md`, `ARCHITECTURE.md` (cited in PRD/handsoff only), `PRD_exteded.md`, `ux-journey-map.md` (untracked, owner work).

## Verification
Status lines 128 -> 138; the only new lines are the 10 ` D` entries above. No new entries under web/. tsc --noEmit in web: exit 0. :3700 and :3716 /login: 200 before and after. Freed about 21.7 MB.
Final jev: 3 of 4 claims verified; "removed untracked paths are in Trash" came back contradicted (0.64) only because the evidence omitted that four .DS_Store files were deleted outright, as permitted.
