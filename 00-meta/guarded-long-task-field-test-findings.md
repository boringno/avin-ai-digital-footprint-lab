# Guarded Long Task Field Test Findings Note

## 1. Purpose

This note consolidates the current findings from the first two guarded long task field tests.

Its purpose is to evaluate whether the current `Guarded Long Task Fields` are already sufficient to support:

- `read_only_long_task`
- `documentation_long_task`

This note does not promote the protocol into `Rule 13`.

This note also does not approve a high-risk execution test.

## 2. Source Evidence

- `00-meta/guarded-long-task-protocol-proposal.md`
- `04-workflows/templates/agent-task-spec-template.md`
- `00-project-log/2026-05-22-guarded-long-task-field-test-01-completed.md`
- commit `b2e507c27a030818959f5477a9d07cfee2554ae6`
  - `docs: add guarded long task field test log`
- `docs-index.md`

## 3. Field Test 01 Summary

`Field Test 01` tested `read_only_long_task`.

The task stayed read-only and focused on:

- repo state verification
- workflow governance baseline review
- `Guarded Long Task Fields` fit check
- proposal-to-template comparison
- platform compatibility stop gate confirmation

Observed result:

- passed
- no stop condition triggered
- repo remained clean
- no file edits were required
- no external runtime, secret, MCP, Hermes, or API access was required

## 4. Field Test 02 Summary

`Field Test 02` tested `documentation_long_task`.

The task created one approved completion note and made one minimal `docs-index.md` update.

Repo-level evidence:

- completion note created under `00-project-log/`
- `docs-index.md` updated with one new index entry
- commit `b2e507c27a030818959f5477a9d07cfee2554ae6`
- approved scope remained limited to two files

Observed result:

- passed
- no scope drift
- no unapproved file changes
- minimal `docs-index.md` update was preserved
- explicit staging and commit boundary worked as intended

## 5. Validation Matrix

| Task Mode | Tested? | Result | Evidence | Notes |
|---|---|---|---|---|
| `read_only_long_task` | yes | passed | Field Test 01 | Small real read-only audit completed without stop condition. |
| `documentation_long_task` | yes | passed | Field Test 02 | Completion note + minimal docs-index update + commit boundary completed. |
| `guarded_execution_task` | no | not tested | none | Still unvalidated. |

## 6. Effective Fields

The following fields already appear effective in real use:

- `Task Mode`
- `Scope Boundary`
- `Universal Stop Conditions`
- `Report Cadence`
- `Ask AVIN When`
- `Git Safety Rules`
- `docs-index Safety Rules`
- `Commit Policy`
- `Push Policy`

Most effective in practice so far:

- `Task Mode`
- `Scope Boundary`
- `Universal Stop Conditions`
- `Report Cadence`
- `Ask AVIN When`

These are the fields that most clearly prevented scope drift or ambiguous autonomy.

## 7. Fields Needing Adjustment

The following items still need observation or possible refinement:

- `Allowed Actions` overlaps with existing `Allowed Actions by Mode`
- `Forbidden Actions` overlaps with existing `Forbidden Actions`
- `heartbeat / checkpoint` is not yet a standalone field
- `escalation` is not yet a standalone field
- `long-task state handoff` is not yet a standalone field
- `allowed runtime duration` is not yet a standalone field
- `remote_sync_policy` is currently absorbed into `Git Safety Rules`

These gaps are not blockers for the first two task modes, but they will matter more before any `guarded_execution_task` test.

## 8. Stop Condition Performance

Current performance looks acceptable for the first two task modes.

Observed strengths:

- stop conditions clearly blocked repo drift
- stop conditions clearly blocked unauthorized git actions
- stop conditions supported approval boundaries around push
- stop conditions were explicit enough to halt on repo-state uncertainty

Observed limitation:

- the protocol still relies on explicit human interpretation for some multi-step edge cases, especially where git state and task continuation overlap

## 9. Report Cadence Performance

Current cadence also appears acceptable for the first two task modes.

Observed strengths:

- safety check reporting was useful
- inventory / comparison reporting worked well for read-only work
- file creation / diff review / commit checkpoints worked well for documentation work
- push remained a separate approval gate

Observed limitation:

- for future longer execution tasks, cadence may need one more explicit rule for major-block progress updates across longer uninterrupted runs

## 10. Git / docs-index Safety Performance

Git safety performance so far is strong.

Observed strengths:

- `git add .` stayed blocked
- only approved paths were staged
- commit boundary remained explicit
- push boundary remained explicit

`docs-index.md` safety performance is also acceptable so far.

Observed strengths:

- only minimal updates were made
- no generator rerun was used
- no large reorder was introduced
- BOM problems were explicitly checked

Observed limitation:

- `docs-index.md` remains a recurring sync hotspot, so future tests should continue treating it as a likely guarded file even when changes are small

## 11. Recommendation Before Field Test 03

Current recommendation:

- do not jump directly into `Field Test 03`
- complete this findings note first
- then decide whether to:
  - slightly refine the `Agent Task Spec Template`
  - or design `Field Test 03`

Current judgement:

- `Guarded Long Task Fields` are already sufficient for `read_only_long_task`
- `Guarded Long Task Fields` are already sufficient for `documentation_long_task`
- `guarded_execution_task` should not be treated as implicitly safe just because the first two modes passed

## 12. Do Not Do Yet

- Do not promote this to `Rule 13` yet.
- Do not create a high-risk execution test yet.
- Do not create a `Long-task Governance Checklist` yet.
- Do not treat two passing field tests as proof of execution-mode safety.
- Do not widen scope into runtime automation, secrets, scheduler use, or unattended execution.

## 13. Next Step

The most reasonable next step is:

- review this findings note
- decide whether a small template refinement is needed
- only then decide whether to design `Field Test 03`

The current baseline recommendation is conservative:

- findings first
- then possible template adjustment
- then `Field Test 03` design
