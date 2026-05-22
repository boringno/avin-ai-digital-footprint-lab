# Codex / Claude Code Handoff Template

Template location: `00-meta/codex-claude-handoff-template.md`

Suggested filled handoff record location:
`00-project-log/handoff-[task-name]-[YYYY-MM-DD].md`

> **Core rule:** Do not trust the outgoing model's verbal status report.
> Always verify with read-only git commands before taking any action.

---

## Section A — Handoff Header

```
Task Name:
Date (YYYY-MM-DD):
Outgoing Model:   [Codex / Claude Code / other]
Incoming Model:   [Claude Code / other]
Task Status at Handoff:   [Completed / In Progress / Blocked]
Push Status at Handoff:   [Pushed / Not Pushed / Unknown]
```

---

## Section B — Read-Only Verification Checklist

The incoming model must run and fill every item below before taking any action.
No item may be skipped. No file may be modified until this section is fully complete.

> **B5 (git fetch) must run before B6–B8.** Skipping fetch means `origin/main` is stale.

### B1. Working Directory

```
Command:  pwd
Expected: C:\Users\user\Documents\New project\avin-ai-digital-footprint-lab
Actual:   [fill in]
Pass/Fail: [ ]
```

### B2. Current Branch

```
Command:  git branch --show-current
Expected: main
Actual:   [fill in]
Pass/Fail: [ ]
```

### B3. Remote URL

```
Command:  git remote -v
Expected: origin  https://github.com/boringno/avin-ai-digital-footprint-lab.git
Actual:   [fill in]
Pass/Fail: [ ]
```

### B4. Worktree Status

```
Command:  git status --short
Expected: (empty — completely clean)
Actual:   [fill in]
Pass/Fail: [ ]
```

### B5. Fetch Remote (required before B6–B8)

```
Command:  git fetch origin
Result:   [fill in — any errors?]
Pass/Fail: [ ]
```

### B6. Ahead / Behind Count

```
Command:  git rev-list --left-right --count origin/main...main
Expected: "0 0" if outgoing model already pushed
          "0 1" (or more) if outgoing model did not push
Actual:   [fill in]
Interpretation: [Already synced / Local is N ahead / Local is behind]
```

### B7. HEAD Commit

```
Command:  git log --oneline -5
Expected HEAD commit (per outgoing model): [fill in from Handoff Header]
Actual HEAD:   [fill in]
Pass/Fail: [ ]
```

### B8. Files Diverging from origin/main

```
Command:  git diff --name-only origin/main..main
Expected: (empty if B6=0 0) or (specific files listed by outgoing model)
Actual:   [fill in]
Pass/Fail: [ ]
```

---

## Section C — Discrepancy Report

Complete this section only if any B item is Fail.
Do not attempt self-repair. Report and wait for AVIN approval.

```
C1. Which item(s) failed?
C2. Expected value vs actual value:
C3. Probable cause:
    (e.g. outgoing model pushed without reporting / dirty worktree / unknown file)
C4. Recommended action (do NOT implement without AVIN approval):
```

---

## Section D — Push Authorization Gate

Complete this section only if B6 shows local commits not yet on origin.

```
D1. Unpushed commit(s):
    Hash:    [fill in]
    Message: [fill in]

D2. AVIN push approval received?
    [ ] Yes — proceed to D3
    [ ] No  — STOP. Wait for approval before continuing.

D3. Pre-push checks (all must pass before git push):
    [ ] git diff --name-only origin/main..main only contains expected files
    [ ] docs-index.md change is minimal (one new index entry only)
    [ ] No bot / CI commit mixed into the local branch
    [ ] No files from prohibited scope (website/, skills/, etc.)

D4. Push result:
    [ ] Success
    [ ] Failed — error: [fill in]
```

---

## Section E — docs-index Bot Alert

```
Known risk: docs-index.md may be updated automatically by CI or a generator script.
If this happens, the file appears dirty in git status without any human change.

If git status shows docs-index.md as modified:
  1. Run: git diff docs-index.md
  2. Check whether the diff is only a bot-appended entry.
  3. Report to AVIN. Do NOT stage or commit independently.
```

---

## Section F — Next Task Gate

All conditions below must be satisfied before starting the next long task.

```
[ ] B1–B8 all Pass (no unresolved Fail)
[ ] origin/main...main = 0 0 (local and remote fully synced)
[ ] git status --short is empty (worktree clean)
[ ] No open Discrepancy Report (Section C)
[ ] AVIN has approved starting the next task

Next task name:   [fill in]
Next task type:   [read_only / documentation / guarded_execution]
```

---

## Section G — Handoff Summary (filled by outgoing model)

```
G1. Files created or modified this session:
G2. docs-index.md — new entries added (list each):
G3. Final commit hash:
G4. Push status:    [Pushed to origin/main / Not pushed — awaiting approval]
G5. Incomplete items (if any):
G6. Known risks or issues for the incoming model:
```

---

## Guarded Long Task Auto-Continue Rules

These rules define when the incoming model may continue without extra approval:

| Condition | Action |
|-----------|--------|
| B1–B8 all pass + `0 0` | May proceed: create files, diff review, precise stage, commit |
| origin is only ahead on `docs-index.md` only | May fast-forward then continue |
| Diverged branch | STOP — report to AVIN |
| Dirty worktree | STOP — report to AVIN |
| Unexpected files in diff | STOP — report to AVIN |
| Need rebase / merge conflict | STOP — report to AVIN |
| After commit | STOP — do not push without AVIN approval |

---

## Prohibited Actions (always, unless explicitly authorized)

- `git add .` or `git add -A`
- `git push` without AVIN approval
- `git rebase`, `git merge`, `git reset`, `git clean`, `git stash`
- Modifying: Guarded Long Task Protocol Proposal, Agent Task Spec Template,
  Rule 12, Platform Compatibility Layer, `website/`, `skills/`
- Any Notion / API / MCP / Hermes operation
- Any operation on `New project 2`
