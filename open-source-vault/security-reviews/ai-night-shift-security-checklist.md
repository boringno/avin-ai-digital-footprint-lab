# JudyaiLab/ai-night-shift Security Checklist

## 1. Review Mode

- Project: `JudyaiLab/ai-night-shift`
- URL: <https://github.com/JudyaiLab/ai-night-shift>
- Mode: document-only security review
- Scope: public repo reading only
- Current decision boundary:
  - not adopted
  - not localized
  - not tested
  - not approved for overnight use

## 2. Permission Risk

- Risk Level: High
- Evidence from Phase 1: `SECURITY.md` documents `SKIP_PERMISSIONS=true` as unrestricted filesystem and shell access.
- Why it matters to AVIN: this directly conflicts with AVIN's approval-gated workflow and repo safety posture.
- Required mitigation before any test: require sandbox-only scope, dedicated workspace, explicit deny list, and no unrestricted mode by default.
- Current status: Open

## 3. Autonomous Execution Risk

- Risk Level: High
- Evidence from Phase 1: README and module docs describe unattended off-hours sessions, cron scheduling, and autonomous rounds.
- Why it matters to AVIN: unsupervised execution can drift beyond approved scope and create hard-to-audit side effects.
- Required mitigation before any test: define stop conditions, heartbeat review rules, escalation rules, and a hard human review gate.
- Current status: Open

## 4. File Modification Risk

- Risk Level: Medium-High
- Evidence from Phase 1: Claude Code runner, adapters, plugins, and shared file channels all imply local file reads and writes.
- Why it matters to AVIN: any future test could modify repo content, local notes, or adjacent files if scope is not isolated.
- Required mitigation before any test: use a disposable sandbox repo, read-only source copies where possible, and explicit writable-path boundaries.
- Current status: Open

## 5. Commit / Push Risk

- Risk Level: Medium-High
- Evidence from Phase 1: the plugin list includes `git_commit_summary`, and the framework is aimed at coding workflows that can create commit-like outputs.
- Why it matters to AVIN: any automation that reaches git actions could bypass AVIN's explicit stage, commit, and push approvals.
- Required mitigation before any test: forbid remote credentials, forbid auto push, and require manual review before any git write action.
- Current status: Open

## 6. API Key / Secrets Risk

- Risk Level: Medium
- Evidence from Phase 1: `SECURITY.md` instructs users to keep keys in `config.env`; adapters and modules assume CLI credentials may exist.
- Why it matters to AVIN: any integration path that depends on local CLI credentials can expose secrets during unattended execution.
- Required mitigation before any test: no real keys, no shared credentials, no production accounts, and isolated test-only secrets if a later sandbox plan is approved.
- Current status: Blocked

## 7. Dependency / Install Risk

- Risk Level: Medium-High
- Evidence from Phase 1: README quick start requires clone, `install.sh`, cron setup, and optional external tooling such as Gemini CLI or task integrations.
- Why it matters to AVIN: install scripts and dependency trees expand blast radius before trust is established.
- Required mitigation before any test: review install flow line by line, isolate package footprint, and design a no-secrets sandbox environment first.
- Current status: Open

## 8. Prompt Injection Risk

- Risk Level: Medium-High
- Evidence from Phase 1: the design combines shared inbox items, shared logs, task boards, and research inputs across multiple agents.
- Why it matters to AVIN: file-based coordination can propagate malicious or low-quality instructions across agents if message trust is weak.
- Required mitigation before any test: require trusted-input rules, message validation, source tagging, and hard limits on external content routing.
- Current status: Needs manual review

## 9. Long-running Process Risk

- Risk Level: High
- Evidence from Phase 1: Claude module documents multi-round sessions, time windows, rate-limit waits, and scheduled night windows.
- Why it matters to AVIN: long-lived processes are harder to supervise, stop, and audit when they stall or drift.
- Required mitigation before any test: require timeout enforcement, max-duration caps, kill-switch rules, and morning audit review criteria.
- Current status: Open

## 10. Plugin / Adapter Lifecycle Risk

- Risk Level: High
- Evidence from Phase 1: `plugins/README.md` documents pre, task, and post lifecycle hooks; `adapters/README.md` allows multiple agent adapters including `codex-cli`.
- Why it matters to AVIN: plugins and adapters expand execution surface area and can hide side effects behind convenience hooks.
- Required mitigation before any test: disable all plugins by default, inspect adapter behavior, and explicitly review every enabled lifecycle hook.
- Current status: Open

## 11. Cron / Scheduler Risk

- Risk Level: High
- Evidence from Phase 1: README, Claude, and Gemini docs all show cron-based unattended scheduling.
- Why it matters to AVIN: scheduler persistence can continue running after attention shifts elsewhere, especially in shared local environments.
- Required mitigation before any test: no persistent scheduler setup, no startup registration, and only manual one-shot simulation in an isolated sandbox if later approved.
- Current status: Blocked

## 12. Shared Inbox / Shared Log Contamination Risk

- Risk Level: Medium-High
- Evidence from Phase 1: `protocols/README.md` documents append-only `night_chat.md` and shared JSON inboxes for cross-agent coordination.
- Why it matters to AVIN: low-trust message flows can spread stale context, malformed tasks, or adversarial instructions across agents.
- Required mitigation before any test: define message ownership, validation rules, archive rules, and explicit escalation for unprocessed items.
- Current status: Needs manual review

## 13. Overclaim Risk

- Risk Level: Medium
- Evidence from Phase 1: README claims "30+ real production night shifts" and "battle-tested", but this review did not independently verify those claims.
- Why it matters to AVIN: overclaim can push a repo from research candidate into premature trust.
- Required mitigation before any test: treat performance and safety claims as unverified until independently tested under controlled conditions.
- Current status: Needs manual review

## 14. Maintainability Risk

- Risk Level: Medium
- Evidence from Phase 1: the framework spans multiple modules, adapters, protocols, plugins, schedules, and optional task integrations.
- Why it matters to AVIN: long-task systems degrade quickly if ownership, version assumptions, or module boundaries are unclear.
- Required mitigation before any test: map required modules, identify minimum viable subset, and define what can be safely ignored in a first sandbox design.
- Current status: Not enough evidence

## 15. Human Review Gate Risk

- Risk Level: Medium-High
- Evidence from Phase 1: docs mention morning reports and permission modes, but not a strict approval gate equivalent to AVIN `Rule 12`.
- Why it matters to AVIN: without a hard review gate, autonomy can outrun design approval and audit expectations.
- Required mitigation before any test: wrap any later test plan in AVIN gating rules, including pre-approval, stop conditions, and review checkpoints.
- Current status: Open

## 16. Repo Integration Risk

- Risk Level: High
- Evidence from Phase 1: the framework is intended to coordinate coding agents with file access, shell access, and optional git-adjacent behavior.
- Why it matters to AVIN: direct integration into the AVIN repo would create unacceptable risk before sandbox design, checklist review, and explicit approval.
- Required mitigation before any test: no repo integration, no shared credentials, no shared scheduler, and no use against AVIN production assets.
- Current status: Blocked

## 17. Current Security Position

- Phase 2 result: documentation only
- Recommended status:
  - security checklist completed
  - still not approved for test
  - still not approved for integration
- Safe next-step options after review:
  - comparison note with AVIN current governance model
  - sandbox-only test plan design
