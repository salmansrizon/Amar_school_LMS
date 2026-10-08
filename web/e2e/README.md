# E2E tests

Playwright end-to-end suite. `npm run test:e2e` runs the whole thing against
a local `next dev` server (see `playwright.config.ts`); `E2E_PORT` picks the
port when 3000 is already taken by another worktree's dev server.

Per-role login happens once in the `setup` project (`global.setup.ts`),
writing `e2e/.auth/<role>.json`; specs and `fixtures/roles.ts` reuse that
storageState instead of logging in per test.
