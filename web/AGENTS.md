<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


# Architecture — layered DDD + engines (ADR 0008, map #258)
- Layers: Presentation (`app/` components) → API (thin `app/api/*` + server actions) → Application (use-case orchestration) → Domain (framework-free business logic) → Infrastructure (Supabase/SMS/email adapters) → Persistence (repositories). No business logic in components or route handlers.
- Domain modules live in `web/modules/<domain>/{domain,application,infrastructure}`; a module never touches another module's tables or internals directly.
- Reusable platform engines live in `web/lib/engines/<engine>/` (`events`, `audit`, `policy`, `feature`, `workflow`, `notification`, `financial`). Consume them; do not re-implement authz/audit/approval/financial/notification logic per feature.
- Modules communicate via domain events (`lib/engines/events`) over direct cross-module calls where practical.
- Config over code: pricing, commission, permissions, feature availability, workflows, notification routing live in DB config tables, never hardcoded.
- Existing `lib/*.ts` migrates into this structure incrementally, only when a #258 phase touches that domain. Refactors are behavior-preserving — pin current behavior with tests first (`tests/unit/grading.test.ts` = reference pattern).
- Done-bar commands: `npm run typecheck`, `npm test` (unit+integration), `npm run test:unit`, `npm run test:integration`.

# Claude Code Configuration
- Allow Auto Mode to run test commands (`npm test`, `pytest`).
- Allow file modifications within the `src/` and `web/` directories.
- Safe domains for network requests: ://github.com, localhost:3000.

# for implementing any wayfinder map / github issues
- first select the mentioned issue/ wayfinder map from github
- use /implement to execute the issue
- use /code-review to review the codebase for this issue
- for single issue don't create any direct PR if user not mentioned to create
- for PR creation follow the wayfinder map , once all the sub task is complted the create a PR for this map 
- after creating PR ask user to review
- after compleating 3 issues run /improve-codebase-architecture  to review the code quality and architecture and try to implement priority fixes from the report 
- after compleating any issue check the dependency within the map if no dependency then close it 
- don't close the wayfinder map just close their sub issues

## Subagent Usage

Use subagents only when they provide meaningful value. Handle implementation directly whenever possible.

When a subagent is needed:

For simple exploration, code searches, mechanical checks, basic reviews, and other low-complexity tasks, use Haiku.
For complex investigation, architecture, security, difficult debugging, or tasks requiring substantial reasoning, use the default/main model.
Do not spawn multiple subagents when one subagent or the main agent can handle the work efficiently.

Choose the subagent model based on the complexity of the subagent's specific task, not the overall task complexity.