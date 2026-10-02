# E2E tests

Playwright end-to-end suite. `npm run test:e2e` runs the whole thing against
a local `next dev` server (see `playwright.config.ts`); `E2E_PORT` picks the
port when 3000 is already taken by another worktree's dev server.

Per-role login happens once in the `setup` project (`global.setup.ts`),
writing `e2e/.auth/<role>.json`; specs and `fixtures/roles.ts` reuse that
storageState instead of logging in per test.

## Agentic suite (`e2e/agentic/`)

A handful of goal-driven smoke tests, run separately from the main suite via
`npm run test:agentic`. Instead of Playwright selectors, each test hands a
plain-English goal (e.g. "open the first exam's Exam Documents menu and open
the Routine print preview") to [jev-ultrafast](https://github.com/browser-use/jev-ultrafast),
which picks the clicks itself, then the test asserts the resulting page with
normal Playwright `expect`s. Every goal is read-only against the fixture
school.

### Setup (one-time, outside this repo)

```bash
git clone https://github.com/browser-use/jev-ultrafast.git ~/tools/jev-ultrafast
cd ~/tools/jev-ultrafast
uv sync
cp .env.example .env
# Edit .env and add:
#   TYPESAFE_API_KEY=...
#   TEXT_MODEL_API_KEY=...   (an OpenRouter key works out of the box)
```

`JEV_ULTRAFAST_DIR` (env var) points `e2e/agentic/jev.ts` at a different
checkout if you keep it somewhere other than `~/tools/jev-ultrafast`.

### Running

```bash
E2E_PORT=3700 npm run test:agentic
```

If the tool isn't checked out, or either key is missing from its `.env`, the
whole `@agentic` suite reports **skipped** with the specific reason (it never
reads or prints the key values -- only whether they're set). `npm run
test:e2e` never touches this suite; it lives in its own directory and npm
script on purpose.

### Debugging a failed run

Each test writes jev's full decision/action trace to
`test-results/agentic-traces/<name>.json` (history, per-step confidence,
latencies) regardless of pass/fail -- the failure message includes the path.

To watch jev act interactively instead of reading a trace, run its own local
inspector from the tool checkout:

```bash
cd ~/tools/jev-ultrafast && uv run jev
```

Open `http://127.0.0.1:8766`, pick a scenario, and step through it one
decision at a time. This is jev-ultrafast's own demo UI (a different browser
session than the Playwright-launched one the suite uses) -- useful for
sanity-checking a goal's wording, not for inspecting a specific test run.
