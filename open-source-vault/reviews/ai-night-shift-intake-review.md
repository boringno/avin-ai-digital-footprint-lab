# JudyaiLab/ai-night-shift Intake Review

## 1. Purpose

- This note records a Phase 2 document-only intake review for `JudyaiLab/ai-night-shift`.
- Scope is limited to public repo reading and architecture assessment.
- This is not an adoption note, not a localization note, and not a test approval.

## 2. Source

- Repo: <https://github.com/JudyaiLab/ai-night-shift>
- Reviewed sources:
  - `README.md`
  - `SECURITY.md`
  - `docs/advanced.md`
  - `protocols/README.md`
  - `adapters/README.md`
  - `claude-code/README.md`
  - `gemini/README.md`
  - `openclaw/README.md`
  - `plugins/README.md`

## 3. Phase 1 Summary

- Initial Decision: `Intake Review Continue`
- Current position:
  - Not Adopt
  - Not Localize
  - Not Test Plan Candidate
- Current boundary:
  - No clone
  - No install
  - No script execution
  - No API key setup
  - No `skills/` import
- Phase 1 conclusion:
  - The repo is relevant to long-task orchestration research.
  - The next safe step is a security checklist, not a function trial.

## 4. What It Is

`ai-night-shift` appears to be a multi-agent off-hours orchestration framework for long-running AI work. Its main claim is not "one more AI CLI wrapper", but a coordinated workflow that combines:

- a continuous coding agent
- a periodic research or triage agent
- a heartbeat or coordinator agent
- shared communication through files
- shared logs and task routing
- schedule-based unattended operation

From AVIN's perspective, it is most relevant as a reference pattern for:

- multi-agent long task orchestration
- heartbeat and checkpoint design
- file-based queues and shared logs
- safety boundaries for unattended agent work

## 5. What It Is Not

- It is not a drop-in `skill` for the AVIN repo.
- It is not an approved overnight automation for AVIN.
- It is not a verified production-safe autonomous agent system.
- It is not a direct substitute for AVIN `Rule 12`.
- It is not a green light to let agents modify AVIN assets unattended.

## 6. Relevance to AVIN AI Digital Footprint OS

| AVIN System | Relevance | Note |
|---|---|---|
| Rule 12 Design Approval Gate | High | Useful as a contrast case for stop conditions, autonomy rules, and escalation boundaries. |
| Agent Task Spec Template | High | Helpful for strengthening long-task fields such as autonomy rules, timeout, escalation, and done criteria. |
| Open-source Vault intake workflow | High | Fits the vault pattern of intake review first, then security review, then any later test design. |
| Codex / ChatGPT division of work | Medium-High | The adapter model and role split are relevant to future multi-agent division of work. |
| Platform Output Live Audit | Low | Not a direct platform-output tool, but relevant as future orchestration infrastructure. |
| Public Identity Layer | Low | No direct positioning value at this stage. |
| Case Candidate Index | Medium | Could become a workflow governance case candidate after more review. |
| Future AI Workflow OS long-task orchestration | Very High | This is the strongest fit area. |

## 7. Capability Map

| Capability | Status | Note |
|---|---|---|
| Multi-agent orchestration | Clearly present | Repo explicitly separates developer, researcher, and coordinator patterns. |
| Long-running task loop | Clearly present | Claude module documents rounds, time windows, timeouts, and rate-limit waits. |
| Task routing | Clearly present | Heartbeat routing rules and task board references are documented. |
| Heartbeat / checkpoint | Clearly present | OpenClaw heartbeat pattern is a core module. |
| Shared log | Clearly present | `night_chat.md` is positioned as a shared append-only log. |
| File-based queue | Clearly present | `bot_inbox/` JSON queue is documented in protocols. |
| Role-based agents | Clearly present | Claude, Gemini, and Heartbeat are presented as distinct roles. |
| Night-shift automation pattern | Clearly present | README and module docs are built around off-hours scheduling. |
| Recovery / escalation pattern | Implied | Timeout handling and heartbeat escalation rules are documented, but not fully proven by Phase 2. |
| Human review gate | Implied | Morning reports and permission modes exist, but not as a hard approval gate. |

## 8. Initial Decision

`Intake Review Continue`

Reason:

- The repo is relevant enough to AVIN long-task orchestration research.
- It shows clear architecture patterns that may strengthen future workflow governance work.
- It also carries obvious unattended execution risk, so it should not skip security review.

## 9. Recommended Next Step

- Current next step: complete a security checklist.
- After the checklist, Phase 3 can consider one of these, but not execute yet:
  - comparison note with AVIN current governance rules
  - test plan design for a sandbox-only review

## 10. Do Not Do Yet

- Do not clone this repo into AVIN workspaces.
- Do not install dependencies.
- Do not run overnight automation.
- Do not provide API keys or tokens.
- Do not connect it to the AVIN repo.
- Do not allow auto commit or auto push behavior.
- Do not write it up as adopted.
- Do not write it up as production-safe.
