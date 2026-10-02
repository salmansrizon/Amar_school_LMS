"""Runs one jev-ultrafast goal against an existing browser, for jev.ts.

Invoked as:
  uv run --project <jev-ultrafast dir> --env-file <dir>/.env python jev_runner.py \
      --url URL --goal GOAL --trace-path PATH

BU_CDP_URL (and BU_NAME) must already be set in the environment by the caller
so Agent()'s browser-harness attaches to that browser over CDP instead of
launching its own Chrome.

Contract with jev.ts: exactly one JSON object on the last line of stdout.
Everything else (trace) goes to --trace-path.

Deliberately does not call agent.close(): closing would close the CDP tab
jev just acted on, and the whole point of this bridge is that the caller's
Playwright test inspects that tab afterwards. The tab is cleaned up when the
test's browser process exits.
"""

import argparse
import json

from jev_ultrafast import Agent


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--goal", required=True)
    parser.add_argument("--trace-path", required=True)
    args = parser.parse_args()

    result = {"status": "error", "steps": 0, "elapsed_ms": 0, "error": None}
    trace = {"goal": args.goal, "url": args.url}
    try:
        agent = Agent(args.url, args.goal)
        state = None
        for state in agent.run():
            pass
        if state is not None:
            result["status"] = state["status"]
            result["elapsed_ms"] = state["elapsed_ms"]
            result["steps"] = len(state["history"])
            trace["status"] = state["status"]
            trace["history"] = state["history"]
            # decisions carry token usage; drop it, the history above already
            # has the per-step probability/confidence/latency that matter for
            # debugging a failed run.
            trace["decisions"] = [{k: v for k, v in d.items() if k != "usage"} for d in state["decisions"]]
    except Exception as exc:  # noqa: BLE001 -- always report to stdout, never crash silently
        result["error"] = f"{type(exc).__name__}: {exc}"
        trace["error"] = result["error"]

    with open(args.trace_path, "w") as f:
        json.dump(trace, f, indent=2, default=str)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
