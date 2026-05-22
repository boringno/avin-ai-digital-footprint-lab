# Guarded Long Task Protocol Proposal

## 1. Purpose

This proposal defines a guarded execution layer for longer AVIN tasks.

Its purpose is not to replace design approval. Its purpose is to define how an agent may continue working after AVIN has already approved the task scope.

The core problem is:

- AVIN should not need to approve every tiny step in a long task
- but agents also should not be allowed to expand scope on their own
- long tasks should be able to continue within approved boundaries
- progress should be visible through regular reporting
- any meaningful risk should force the agent to stop and ask AVIN

This proposal is therefore a safety-belt layer for long tasks, not a removal of existing guardrails.

## 2. Relationship to Rule 12

`Rule 12` and `Guarded Long Task Protocol` solve different parts of the same workflow.

`Rule 12` governs:

- design first
- approval second
- execution third

`Guarded Long Task Protocol` governs:

- after execution is approved, how an agent may continue working safely
- which actions are still allowed
- which stop conditions require escalation
- when AVIN must be asked again

So the relationship should be read as:

1. `Rule 12` defines whether a task is approved to begin.
2. `Guarded Long Task Protocol` defines whether an approved task may continue automatically.

This protocol does not replace `Rule 12`.

## 3. Task Modes

### 3.1 Read-only Long Task

**Use when:**

- the task is exploratory
- the task is audit-heavy
- the task requires broad reading, comparison, or synthesis
- no file changes are approved

**Allowed actions:**

- read repo files
- search repo text
- inspect git history and diff in read-only mode
- inspect public documentation
- summarize findings

**Forbidden actions:**

- edit files
- stage, commit, or push
- rebase or merge
- install, clone, or run scripts

**Stop conditions:**

- wrong repo
- dirty worktree
- required evidence is outside approved read-only scope
- task pressure starts drifting into implementation

**Report cadence:**

- after safety check
- after read-only inventory
- before any design recommendation

### 3.2 Documentation Long Task

**Use when:**

- AVIN has approved a bounded documentation task
- target files are explicit
- the task includes note creation, review writeback, or minimal `docs-index.md` updates

**Allowed actions:**

- create or edit approved markdown files
- make minimal `docs-index.md` updates
- stage only approved paths
- commit after review
- push only after approval

**Forbidden actions:**

- `git add .`
- touching unapproved files
- rerunning generators without approval
- large index reorderings
- install, clone, or script execution

**Stop conditions:**

- `docs-index.md` diff is larger than expected
- encoding pollution or BOM appears
- remote is ahead or diverged
- an unapproved file becomes part of the change

**Report cadence:**

- after safety check
- before file edits
- after file edits
- after diff review
- before commit
- after commit
- before push

### 3.3 Guarded Execution Task

**Use when:**

- AVIN has approved a longer multi-step task
- the work needs several consecutive edits or checks
- the task is still bounded by explicit file scope and safety rules

**Allowed actions:**

- continue through approved steps without re-asking on every small action
- edit only within approved paths
- run verification steps that are already within approved scope
- produce periodic progress updates

**Forbidden actions:**

- expanding into new folders or files without approval
- touching prohibited areas
- escalating into high-risk execution on its own
- using API keys, secrets, or external runtime systems without approval

**Stop conditions:**

- any universal stop condition
- platform compatibility becomes relevant but unclear
- a new folder or additional file is needed outside approved scope
- any git action stops being clearly safe

**Report cadence:**

- after safety check
- before each major execution block
- after each major execution block
- after diff review
- before commit
- before push
- immediately at any stop condition

## 4. Allowed Actions

Allowed actions under this proposal depend on mode, but the safe baseline is:

- read approved files
- search repo text
- inspect git status, log, diff, and divergence
- create or edit only approved files
- update `docs-index.md` only when explicitly approved
- stage only explicitly approved paths
- commit only after scoped review
- push only after explicit approval

Allowed actions never imply open-ended authority.

## 5. Forbidden Actions

The following remain forbidden unless AVIN explicitly approves them for a specific task:

- `git add .`
- `git reset --hard`
- `git clean`
- `git stash`
- `git push --force`
- touching prohibited repo areas
- editing beyond approved file scope
- clone
- install
- run scripts
- use API keys or secrets
- connect Notion, MCP, Hermes, or external APIs
- operate in `New project 2`
- operate in a parent repo instead of the target repo

## 6. Universal Stop Conditions

Any long task must stop and report when any of these occurs:

- worktree dirty
- remote ahead
- remote behind in a way that changes approved git assumptions
- diverged history
- rebase required
- merge conflict
- `docs-index.md` diff larger than expected
- `docs-index.md` contains BOM, Chinese mojibake, or encoding pollution
- unapproved file changes appear
- an unapproved folder is required
- a prohibited area must be touched
- install, clone, or script execution becomes necessary
- API key or secrets become necessary
- Notion, MCP, Hermes, or external API access becomes necessary
- platform compatibility is unclear
- task goal drifts outside the approved scope
- wrong repo, `New project 2`, or parent repo path is detected
- force push, reset, clean, or stash would be needed
- any git action is no longer clearly safe under the original approval

## 7. Report Cadence

Minimum report points for guarded long tasks:

- after safety check
- after read-only inventory
- before file edits
- after file edits
- after diff review
- before commit
- after commit
- before push
- immediately when a stop condition appears

For larger tasks, the agent should also report after each major execution block instead of silently chaining too many steps together.

## 8. Git Safety Rules

- Never use `git add .`
- Stage only explicitly approved paths
- Check `origin/main...main` before push
- If remote is ahead, do not push directly
- If history is diverged, do not pull directly
- Rebase or merge requires separate approval
- Force push is always forbidden unless AVIN gives one explicit single-use approval
- If worktree is not clean, do not continue into write / commit / push stages
- If push succeeds but no post-push verification is performed, the next task must begin with a fresh safety check

## 9. docs-index Safety Rules

- Only make minimal updates
- Do not rerun the generator unless separately approved
- Do not reorder large sections
- Check for BOM
- Check for Chinese mojibake or encoding pollution
- If diff size exceeds expectation, stop and report
- If remote bot commits touch `docs-index.md`, do not assume safety without checking divergence first
- If `docs-index.md` becomes the only conflict file, resolve it conservatively and keep the update minimal

## 10. Platform Compatibility Safety Rules

- Any workflow involving shell, scheduler, path assumptions, local CLI, file write, git operation, secret manager, or unattended execution must be tagged for platform compatibility before test-plan discussion
- Do not label a macOS-only workflow as cross-platform
- Do not label a Windows-only workflow as cross-platform
- If the evidence is unclear, label it `Not enough evidence`
- If platform compatibility is not yet understood, the task must stop before test planning or runtime expansion

## 11. When Agent Can Continue Automatically

An agent may continue automatically only when all of the following remain true:

- task scope is still the same as AVIN approved
- target files are still within approved boundaries
- no universal stop condition has been triggered
- git state remains safe
- platform compatibility is either irrelevant or already understood
- the next step is a normal continuation, not a change in authority

Automatic continuation is a bounded privilege, not general autonomy.

## 12. When Agent Must Ask AVIN

The agent must ask AVIN again when:

- a new file outside approved scope is needed
- a new folder is needed
- `docs-index.md` diff becomes unexpectedly large
- git divergence appears
- rebase or merge becomes necessary
- commit is ready
- push is ready
- platform compatibility is unclear
- the task starts implying install, clone, script execution, secrets, or external system access
- a prohibited area would need to be touched
- the task objective itself appears to be changing

## 13. Example Long Task Spec

```text
Task Mode:
Documentation Long Task

Approved Scope:
- 00-meta/example-proposal.md
- docs-index.md

Allowed Actions:
- create the proposal file
- add one docs-index entry
- stage only those two files
- commit only after diff review

Forbidden Actions:
- git add .
- editing any other file
- generator rerun
- push without approval

Report Cadence:
- safety check
- before writing
- after writing
- after diff review
- after commit
- before push

Stop Conditions:
- docs-index diff exceeds one expected entry
- unexpected encoding change appears
- remote ahead or diverged
- additional files become necessary
```

## 14. Do Not Do Yet

- Do not treat this proposal as active enforcement until AVIN explicitly adopts it
- Do not reinterpret it as approval for unattended execution
- Do not let it bypass `Rule 12`
- Do not use it to justify install, clone, or runtime expansion
- Do not connect it to `Hermes`, `MCP`, `Notion`, or API access
- Do not use it as a shortcut into test-plan execution

## 15. Recommended Next Step

After this proposal, the most consistent next step is:

- create an `Agent Task Spec Extension` aligned to the protocol

After that, a later follow-up may be:

- create a `Long-task Governance Checklist`

Only after those are in place should AVIN consider whether any future guarded test-plan design is warranted.
