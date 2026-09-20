# Agent Instructions — VolantiniPro

## Mandatory Runtime Acceptance Skill

For every bugfix, regression, runtime issue, mobile issue, GPS issue, messaging issue, payment issue, Step 2 issue, dashboard issue, performance issue, or production-validation task, read and apply:

.agents/skills/volantinipro-runtime-acceptance/SKILL.md

No user-reported bug may be marked PASS without real runtime evidence.

## Project Code Review Workflow

The repository review workflow is `.claude/skills/project-code-review/SKILL.md`. When the user asks for a project code review at HIGH effort, that request authorises the parent session to launch 8 independent `review-finder` agents and, after deduplication, one separate `review-verifier` agent per deduplicated candidate (definitions in `.claude/agents/`). The base is resolved only with `node scripts/review-base.mjs` (never `origin/HEAD`), and the run must produce a ledger validated by `node scripts/check-review-ledger.mjs`. Workflow fidelity (PASS/FAIL) is reported separately from the review findings. No other task may launch agents without an explicit request.
