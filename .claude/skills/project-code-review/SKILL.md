---
name: project-code-review
description: Repository code-review workflow with MEASURABLE orchestration. At HIGH effort the PARENT session launches 8 independent review-finder agents (one per angle), deduplicates their candidates, launches exactly one independent review-verifier agent per deduplicated candidate, writes a ledger and validates it with scripts/check-review-ledger.mjs. Use only when the user explicitly asks for a project code review.
argument-hint: "[--base <ref>] [--effort HIGH]"
disable-model-invocation: true
---

# project-code-review

This skill is a CONTRACT that the PARENT session follows. It is NOT run as a forked agent: a forked agent cannot delegate, and one agent pretending to run eight reviews is exactly what this workflow exists to prevent. Invoking this skill (or asking for a HIGH project review) is the user's explicit authorisation to launch the finder and verifier agents below. No other task may launch agents without an explicit request.

Only HIGH effort is defined. If fewer than 8 real finder invocations happen, the result is `WORKFLOW_FIDELITY=FAIL`, even if there are zero findings. Workflow fidelity is independent of the review outcome.

## Hard rules

- Never use `origin/HEAD`. Resolve the base only with `node scripts/review-base.mjs [--base <ref>]`.
- Finders and verifiers are read-only. They must not edit, commit, push, stage, or change git refs, and they must not launch agents.
- Never reuse a finder agent as a verifier. Never verify a candidate inline in the parent instead of launching its verifier. Never invent agents, IDs or timestamps.
- Do not paste raw harness agent IDs into user-facing text (the harness marks them internal). Record `agent_invocation_id` in the ledger as `sha256:` + the first 16 hex characters of the SHA-256 of the harness-reported agent ID: it is derived from the real invocation, unique per agent, and does not disclose the raw ID. If the harness exposes no ID at all, set `invocation_ids_available` to `false` in the ledger and say so in the report.
- The ledger proves the SHAPE of the workflow (real invocations, order, overlap, one verifier per candidate). It does not prove reasoning quality, independence of reasoning, or that the parent-reported fields are honest.

## Steps

1. **Resolve the base.** Run `node scripts/review-base.mjs` (or with `--base <ref>` if the user gave one). Read the KEY=VALUE lines. If `STATUS` is `BLOCKED` or `AMBIGUOUS`, stop and report `BLOCKED_BASE` with the reasons and candidates. Otherwise keep `BASE_REF`, `BASE_SHA`, `HEAD_SHA`, `MERGE_BASE`. Review scope = `git diff <MERGE_BASE>...HEAD` plus the working tree (tracked changes and new untracked files that belong to the task). Build an explicit file list for the finders.
2. **Create a review id and a scratch directory** outside the repository (for example the session scratchpad). Record wall-clock times with `node -e "console.log(new Date().toISOString())"`; never estimate them.
3. **Launch 8 finders concurrently**: in ONE message, make 8 separate Agent calls, one per angle, all in the background. Use `subagent_type: "review-finder"` when that agent type is registered in the session; if it is not registered, use `general-purpose` and paste the full body of `.claude/agents/review-finder.md` as the prompt (record the agent type actually used). Give every finder its own `name`. The launch prompt of each finder contains: `review_id`, `finder_id` (F1..F8), `angle`, `base_ref`, `base_sha`, `merge_base`, `head_sha`, the file scope, and the instruction to return the JSON object defined in the agent file. Angles (exactly one per finder):
   - F1 `correctness` — correctness / logic
   - F2 `security` — security / authentication / authorization / trust boundaries
   - F3 `data_integrity` — data integrity / persistence / state consistency
   - F4 `concurrency` — concurrency / race conditions / lifecycle
   - F5 `tests_contracts` — tests / contracts / regression gaps
   - F6 `error_handling` — error handling / recovery / edge cases
   - F7 `performance` — performance / resource behaviour
   - F8 `integration` — integration / compatibility / maintainability risks
   Immediately after launching, record for each finder: `requested_at` (time just before the launch message), `started_at` (time the launch was acknowledged), the harness agent ID (hash it as above) and `agent_type`.
4. **Collect.** When each finder's completion notification arrives, record `completed_at` (real time observed) and the harness-reported duration as `harness_duration_ms`. Parse the finder JSON. A finder that fails or returns unparseable output is not a finder entry: replace it with a NEW invocation (new name, new requested_at). `finders[]` must contain exactly 8 entries, all `status: completed`, otherwise fidelity FAILS. Record each failed or replaced attempt in the optional top-level `failed_attempts[]` array (`finder_id`/`verifier_id`, `status`, `reason`), which the validator ignores, and report it in the `failed:` counter and in the report text. A launch the harness rejected before any agent started (for example a lock error) is not an invocation; relaunch it and note it.
5. **Deduplicate in the parent.** Give every finder candidate a `raw_id`; merge candidates that describe the same defect (same file and overlapping lines and the same failure mode) into deduplicated candidates `C1..Cn` with `merged_from` (raw ids), `severity`, `file`, `line_or_range`, `summary`. Every raw candidate must land in exactly one deduplicated candidate: nothing is silently dropped.
6. **Launch one verifier per deduplicated candidate**, all in one message (parallel), each a NEW agent (`subagent_type: "review-verifier"`, or `general-purpose` with the body of `.claude/agents/review-verifier.md` pasted). Each verifier receives exactly ONE candidate plus `review_id`, `verifier_id` (V1..Vn), `candidate_id` and the base/head SHAs. Launch them only after ALL finders have completed. Record `requested_at`, `started_at`, ID hash, `agent_type`; on completion record `completed_at`, `harness_duration_ms`, and the verdict. Zero candidates means zero verifiers.
7. **Decide.** `final_findings` = exactly the candidates whose verifier returned CONFIRMED. REFUTED are dropped and must not be fixed. UNCERTAIN are reported separately and are never treated as confirmed.
8. **Write the ledger** (JSON, outside the repository) with: `schema_version: 1`, `review_id`, `effort: "HIGH"`, `base_ref`, `base_sha`, `merge_base`, `head_sha`, `concurrency_expected: true`, `invocation_ids_available`, `finders_requested: 8`, `finders[]` (`finder_id`, `agent_invocation_id`, `agent_type`, `angle`, `requested_at`, `started_at`, `completed_at`, `status`, `harness_duration_ms`, `raw_candidate_ids`), `raw_candidates[]` (`raw_id`, `finder_id`, plus the finder's candidate fields), `deduplicated_candidates[]`, `verifiers[]` (`verifier_id`, `agent_invocation_id`, `agent_type`, `candidate_id`, `requested_at`, `started_at`, `completed_at`, `status`, `verdict`, `harness_duration_ms`), `final_findings[]` (candidate ids).
9. **Validate.** Run `node scripts/check-review-ledger.mjs <ledger.json>`. Report its first line (`WORKFLOW_FIDELITY=PASS|FAIL`) and any `REASON=` lines verbatim. A FAIL means the review did not follow the workflow, whatever it found.

## Report format

```
Review ID: ...   Base: <BASE_REF> (<BASE_SHA>)   Merge-base: ...   Head: ...
Finders requested: 8 | started: n | completed: n | failed: n
Raw candidates: n | deduplicated: n
Verifiers: started n (one per deduplicated candidate) | completed n
Verdicts: CONFIRMED a | REFUTED b | UNCERTAIN c
WORKFLOW_FIDELITY=PASS|FAIL   (validator output)
Findings: confirmed first, each with id, file:line, severity and the verifier's evidence
Uncertain (not confirmed): ...
Limits: ledger = workflow shape only; agents share a model and may correlate.
```
