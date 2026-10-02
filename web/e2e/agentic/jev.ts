import { execSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Bridges a Playwright-launched Chromium to browser-use's jev-ultrafast
// (https://github.com/browser-use/jev-ultrafast), run out-of-process via `uv`.
// jev-ultrafast is an external tool checkout, not a repo dependency -- see
// e2e/README.md for install steps. This file never reads or logs an API key
// value, only whether one is present (ABSOLUTE RULES ON SECRETS).

/** Checked-out tool location. Override for a different checkout. */
export const JEV_ULTRAFAST_DIR = process.env.JEV_ULTRAFAST_DIR || path.join(os.homedir(), 'tools', 'jev-ultrafast')

const RUNNER = path.join(__dirname, 'jev_runner.py')

export interface JevAvailability {
  ok: boolean
  reason?: string
}

/** True when `name=<non-empty>` appears in envFile. Shells out to `grep -c`
 * (the task's sanctioned check) so only a match *count* ever leaves the file
 * -- never the key value itself. `|| true` keeps grep's "no match" exit code
 * (1) from throwing. */
function keyIsSet(envFile: string, name: string): boolean {
  try {
    const count = execSync(`grep -c '^${name}=.\\+' ${JSON.stringify(envFile)} || true`, {
      encoding: 'utf8',
    }).trim()
    return count !== '' && count !== '0'
  } catch {
    return false
  }
}

/** Everything the @agentic suite needs before it can run a single goal: the
 * tool checked out, and both keys present in *its own* .env (the user puts
 * them there -- never read/written by this helper). */
export function checkJevAvailable(): JevAvailability {
  if (!fs.existsSync(JEV_ULTRAFAST_DIR)) {
    return { ok: false, reason: `JEV_ULTRAFAST_DIR not found: ${JEV_ULTRAFAST_DIR} (see e2e/README.md)` }
  }
  const envFile = path.join(JEV_ULTRAFAST_DIR, '.env')
  if (!fs.existsSync(envFile)) {
    return { ok: false, reason: `${envFile} missing -- copy .env.example to .env and add the keys` }
  }
  if (!keyIsSet(envFile, 'TYPESAFE_API_KEY')) {
    return { ok: false, reason: `TYPESAFE_API_KEY not set in ${envFile}` }
  }
  if (!keyIsSet(envFile, 'TEXT_MODEL_API_KEY')) {
    return { ok: false, reason: `TEXT_MODEL_API_KEY not set in ${envFile}` }
  }
  return { ok: true }
}

export interface JevGoalResult {
  /** jev's own self-report. "error"/"timeout" means the bridge itself (or the
   * model) broke -- a test should fail on those. "done"/"blocked" is jev's
   * verdict on the goal; the test's real pass/fail still comes from its own
   * Playwright assertions on the resulting page (README: "A DONE choice is
   * not proof of success"). */
  status: 'done' | 'blocked' | 'error' | 'timeout'
  stepsRun: number
  elapsedMs: number
  /** Full decision/action history, written whether the run succeeded or not --
   * open this first when a test fails. */
  tracePath: string
  error?: string
}

/** Run one natural-language goal against a Chromium already reachable at
 * `cdpUrl` (its DevTools HTTP endpoint, e.g. http://127.0.0.1:9333 --
 * `chromium.launchPersistentContext(dir, { args: ['--remote-debugging-port=9333'] })`).
 *
 * Spawns jev_runner.py via `uv run --project <tool dir>`, with BU_CDP_URL
 * pointed at that endpoint. browser-harness (jev-ultrafast's CDP layer)
 * resolves BU_CDP_URL's /json/version into the live websocket and attaches
 * to that existing browser instead of launching its own Chrome -- it never
 * drives the user's personal Chrome. BU_NAME picks a daemon identity
 * distinct from "default" so this doesn't collide with a browser-harness
 * daemon the user might be running interactively against their own browser. */
export async function runJevGoal(opts: {
  cdpUrl: string
  url: string
  goal: string
  traceDir: string
  traceName: string
  timeoutMs?: number
}): Promise<JevGoalResult> {
  const timeoutMs = opts.timeoutMs ?? 90_000
  fs.mkdirSync(opts.traceDir, { recursive: true })
  const tracePath = path.join(opts.traceDir, `${opts.traceName}.json`)

  return new Promise((resolve) => {
    // Not `uv run jev` -- that command is jev-ultrafast's own local inspector
    // (pyproject.toml: `jev = "jev_ultrafast.demo:main"`), a demo HTTP server
    // with no --url/--goal flags at all. The scriptable surface for a single
    // goal is the `Agent` class (README's "Use the library" section and
    // examples/run.py); jev_runner.py is a thin CLI wrapper around it so this
    // helper can spawn it like any other one-shot command.
    const child = spawn(
      'uv',
      [
        'run',
        '--project',
        JEV_ULTRAFAST_DIR,
        '--env-file',
        path.join(JEV_ULTRAFAST_DIR, '.env'),
        'python',
        RUNNER,
        '--url',
        opts.url,
        '--goal',
        opts.goal,
        '--trace-path',
        tracePath,
      ],
      {
        cwd: JEV_ULTRAFAST_DIR,
        env: { ...process.env, BU_CDP_URL: opts.cdpUrl, BU_NAME: 'e2e-agentic' },
      },
    )

    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)

    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('close', () => {
      clearTimeout(timer)
      if (timedOut) {
        resolve({
          status: 'timeout',
          stepsRun: 0,
          elapsedMs: timeoutMs,
          tracePath,
          error: `jev goal exceeded ${timeoutMs}ms`,
        })
        return
      }
      // jev_runner.py's only contract: the last stdout line is one JSON object.
      const line = stdout.trim().split('\n').pop() ?? ''
      try {
        const parsed = JSON.parse(line)
        resolve({
          status: parsed.status,
          stepsRun: parsed.steps ?? 0,
          elapsedMs: parsed.elapsed_ms ?? 0,
          tracePath,
          error: parsed.error ?? undefined,
        })
      } catch {
        resolve({
          status: 'error',
          stepsRun: 0,
          elapsedMs: 0,
          tracePath,
          error: (stderr || stdout || 'jev_runner.py produced no parseable output').slice(-2000),
        })
      }
    })
  })
}
