# Platform Compatibility Layer

## 1. Purpose

This file defines the baseline for how AVIN AI Digital Footprint OS should reason about platform compatibility.

Its purpose is not to restructure the repo now. Its purpose is to establish a shared baseline for distinguishing:

- cross-platform core capabilities
- macOS-specific capabilities
- Windows-specific capabilities
- platform-specific capabilities that are still useful as reference

This is a governance baseline, not an execution guide.

## 2. Why Platform Compatibility Layer Is Needed

AVIN OS should not assume that every workflow is equally portable across macOS and Windows.

This layer is needed because the current system already includes signals that differ by platform:

- local CLI usage
- shell behavior
- path style
- scheduler choice
- secret manager choice
- unattended execution patterns
- file write and git operation risk

If these differences are not made explicit, the repo risks collapsing unlike things into one generic workflow model.

That is not enough for AVIN OS.

The safer model is:

- `Cross-platform Core`
- `macOS Extension`
- `Windows Extension`
- `Compatibility Index`

This allows AVIN to keep shared governance rules at the center, while still documenting where platform-specific adaptation is required.

## 3. Core Model

### Cross-platform Core

The shared layer of governance, review, risk classification, task design, and compatibility metadata that should apply regardless of platform.

### macOS Extension

Platform-specific behavior, workflows, or constraints that depend on macOS conventions such as shell defaults, permission behavior, local secret management, or `launchd`.

### Windows Extension

Platform-specific behavior, workflows, or constraints that depend on Windows conventions such as PowerShell, Task Scheduler, Windows path style, or possible WSL dependence.

### Compatibility Index

A future reference layer that allows AVIN to compare workflows, tools, and projects by platform support, portability, and adaptation needs without forcing immediate repo-wide refactoring.

## 4. Classification

Future workflows, tools, and projects should be classifiable using these labels:

- `Cross-platform Core`
  - Shared governance logic or workflow structure with no strong platform-specific execution dependency.
- `macOS Only`
  - Only meaningful or validated on macOS.
- `Windows Only`
  - Only meaningful or validated on Windows.
- `Platform-specific but Referenceable`
  - Not directly portable, but still useful as a candidate, comparison object, or adaptation reference.
- `Not enough evidence`
  - Repo evidence is not sufficient to claim portability or platform support.

## 5. Metadata Fields

Future workflows, tools, and projects may be annotated with:

- `supported_platforms`
- `primary_platform`
- `tested_on`
- `shell_type`
- `path_style`
- `scheduler_dependency`
- `requires_gui`
- `requires_api_key`
- `requires_local_cli`
- `requires_secret_manager`
- `file_write_risk`
- `git_operation_risk`
- `external_service_dependency`
- `portability_notes`
- `equivalent_on_other_platform`
- `adaptation_candidate`
- `requires_wsl`
- `runtime_mode`
- `approval_gate_required`

These fields are candidates for future documentation and workflow tagging. They are not yet enforced repo-wide.

## 6. Suggested Field Values

### `shell_type`

- `none`
- `bash`
- `zsh`
- `powershell`
- `cmd`
- `mixed`
- `unknown`

### `path_style`

- `posix`
- `windows`
- `mixed`
- `unknown`

### `scheduler_dependency`

- `none`
- `cron`
- `launchd`
- `task_scheduler`
- `github_actions`
- `unknown`

### `runtime_mode`

- `manual`
- `assisted`
- `scheduled`
- `unattended`
- `unknown`

## 7. Relationship to ai-night-shift

`ai-night-shift` is one of the clearest current reasons this layer is needed.

Its design appears to lean toward:

- shell or CLI-based operation
- scheduler use
- cron-style automation
- unattended orchestration
- local runtime coordination

That creates platform-specific questions before any future test discussion:

- macOS and Windows do not share the same scheduler model
- path style differs
- permission handling differs
- secret manager choices differ
- local CLI installation and execution assumptions differ

So for AVIN, the current baseline judgement should be:

- if `ai-night-shift` is ever considered for a future test plan, it must first pass platform compatibility review
- without platform compatibility judgement, it should not enter test plan design

## 8. Current Rule

Current baseline rule:

Any workflow that involves local CLI, scheduler use, shell script behavior, file write risk, git operation risk, secret manager dependence, or unattended execution must be annotated for platform compatibility before it can enter test plan discussion.

This is a baseline governance rule, not yet a full repo-wide taxonomy.

## 9. Do Not Do Yet

- Do not create the full `platforms/` structure yet.
- Do not claim a Mac-only workflow is automatically cross-platform.
- Do not claim a Windows-only workflow is automatically cross-platform.
- Do not treat README-level compatibility claims as AVIN OS verification.
- Do not let `ai-night-shift` enter test plan discussion without platform compatibility judgement.
- Do not import `skills/`.
- Do not run platform-specific automation based on this baseline file alone.

## 10. Next Step

The most reasonable next step after this baseline is:

- return to `ai-night-shift Phase 4 Rule Improvement Proposal`

An alternative next step could be:

- create a Phase 1 design for a future Platform Compatibility Index

This file does not decide that next step. It only establishes the baseline.
