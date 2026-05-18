# OS Control Panel UI UX Architecture

## Purpose

This document defines the UI/UX architecture for AVIN OS Control Panel.

AVIN OS Control Panel is the visual operating layer of AI Digital Footprint OS. It is not a SaaS product, not a public platform, and not a general admin backend. Its purpose is to help AVIN see the current system state, workflow layers, candidate queues, review gates, risk signals, and next actions without having to re-open every Markdown file one by one.

The goal is practical clarity:

- What stage the OS is in
- What layers already exist
- What layers are still planned
- What candidate repos are waiting
- What can stay `Document Only`
- What can move to `Practical Trial`
- What needs `Sandbox Test`
- What needs AVIN review
- What may later connect to API, MCP, or Hermes Agent

---

## A. Design Positioning

AVIN OS Control Panel is AVIN's daily AI Workflow OS cockpit.

It should function as:

- personal mission control
- workflow dashboard
- architecture map
- open-source-vault queue
- trigger map
- human review gate
- future API / MCP / Hermes integration map

It should not behave like:

- SaaS product UI
- enterprise admin backend
- multi-tenant control system
- engineering observability console
- autonomous agent runtime panel

The control panel is a human-controlled, static-first, workflow-aware surface that helps AVIN decide what to review, what to try, and what to document next.

---

## B. Primary User and Usage Context

### Primary User

AVIN

### Usage Context

AVIN is not coming from a formal AI or software engineering background, so the UI should reduce cognitive load instead of increasing it. The control panel should help AVIN quickly understand:

- current state
- current stage
- risk level
- next action
- trigger condition
- review requirement

The UI should not assume that AVIN wants to remember every filename, folder, or workflow edge case.

### Secondary Users

- ChatGPT
- Codex
- Claude Code
- future Hermes Agent
- future collaborators or audience members who may only see a public view

The internal version is for operating the OS. A future public view, if any, should be selective and read-only.

---

## C. Core User Questions

The dashboard should answer these questions fast:

- What stage is the OS in right now?
- Which architecture layers are already completed?
- Which architecture layers are still being planned?
- Which workflow is triggered by what event?
- Which repos are currently in the candidate pool?
- Which repos are safe for `Document Only`?
- Which repos are suitable for `Practical Trial`?
- Which repos need `Sandbox Test`?
- Which tasks need AVIN review?
- What should be handed to ChatGPT, Codex, or Claude Code next?
- Which future areas could connect to GitHub API, Notion API, MCP, or Hermes?

---

## D. Core Screens

## 1. Mission Control

### Purpose

Give AVIN one-screen awareness of the current OS situation and next recommended move.

### Key Sections

- Current Stage
- Main Focus
- Latest Completed Layer
- System Health
- Next Recommended Action

### Data Fields

- `Stage`
- `Current focus`
- `Latest completed doc or layer`
- `Open review count`
- `Candidate queue count`
- `Risk summary`
- `Next action owner`
- `Next action status`

### Empty State

No current mission state yet. Start by defining current stage, main focus, and one next action.

### Primary Action

`Review Next Action`

### Future Automation Potential

- Pull latest completion logs automatically
- Summarize current queue counts from project cards
- Surface pending review items from structured dashboard data

---

## 2. Architecture Map

### Purpose

Show AVIN how the OS is structured, what each layer does, and which layers are complete versus planned.

### Key Sections

- Manual OS
- AI Trend Intake Layer
- open-source-vault
- Practical Trial Lane
- Hermes Agent Track
- Content Pipeline
- Productization Layer
- OS Control Panel

### Data Fields

- `Layer name`
- `Layer purpose`
- `Current status`
- `Trigger condition`
- `Primary source docs`
- `Next build priority`

### Empty State

Architecture map not defined yet. Add the first 3 to 5 layers before building a visual view.

### Primary Action

`Open Layer Spec`

### Future Automation Potential

- Generate layer map from structured doc metadata
- Show status from lifecycle logs and layer docs

---

## 3. Trigger Map

### Purpose

Make workflow triggers visible so AVIN can see what event causes what next step.

### Key Sections

- New GitHub repo found
- New AI trend signal found
- New candidate added
- Candidate selected for Document Only
- Candidate selected for Practical Trial
- Candidate selected for Sandbox Test
- Review completed
- Published URL added
- Lifecycle completed
- Agent proposal created
- AVIN approval needed

### Data Fields

- `Trigger`
- `Condition`
- `Routed workflow`
- `Expected output`
- `Review gate`
- `Next action`

### Empty State

No trigger map yet. Start by mapping repo discovery, review completion, and lifecycle completion.

### Primary Action

`Trace Workflow`

### Future Automation Potential

- Trigger-to-workflow lookup from JSON
- Auto-highlight recently activated paths

---

## 4. Open-source Vault Queue

### Purpose

Provide a working queue for external repo observation, review, and next-step routing.

### Key Sections

- Candidate Batch
- Project Cards
- Risk Level
- Suggested First Action
- Lifecycle Status
- Review Notes

### Data Fields

- `Project name`
- `Source URL`
- `Trend category`
- `Architecture fit`
- `Initial risk`
- `Suggested first action`
- `Lifecycle status`
- `Latest review note`

### Empty State

No candidates yet. Add a candidate batch first, then convert 1 to 2 repos into project cards.

### Primary Action

`Open Project Card`

### Future Automation Potential

- Aggregate candidate data from `open-source-vault/projects/`
- Show review status counts automatically
- Flag items ready for comparison or practical trial

---

## 5. Workflow Experiment Board

### Purpose

Turn repo and trend decisions into a visible workflow board instead of a hidden file maze.

### Key Sections

- Watch
- Document Only
- Practical Trial
- Sandbox Test
- Localize
- Archive
- Completed

### Data Fields

- `Item title`
- `Current lane`
- `Owner`
- `Reason`
- `Related docs`
- `Next step`

### Empty State

No experiment items yet. Move one candidate into `Document Only` first.

### Primary Action

`Move to Next Lane`

### Future Automation Potential

- Build lanes from status fields in project cards and review notes
- Show stuck items based on unchanged status duration

---

## 6. Review Gate

### Purpose

Create a clear human review checkpoint before anything becomes localized, integrated, or publicly framed as an OS decision.

### Key Sections

- Items waiting for AVIN
- AI / Codex / Claude output
- Risk notes
- Decision options
- Next action

### Data Fields

- `Review item`
- `Source output`
- `Risk note`
- `Decision requested`
- `Recommended next step`
- `Assigned reviewer`

### Empty State

No review items waiting. Add a review item after the first document-only review or practical trial note.

### Primary Action

`Approve Next Step`

### Future Automation Potential

- Auto-collect review candidates from project and review docs
- Create decision prompts from structured state fields

---

## 7. Future Integration Panel

### Purpose

Show future engineering connection points without turning the current dashboard into an integration-heavy system too early.

### Key Sections

- GitHub API
- Notion API
- MCP
- Hermes Gateway
- RSS / GitHub Trending
- AI Signal Radar
- GitHub Actions data generation

### Data Fields

- `Integration target`
- `Current stage`
- `Allowed scope`
- `Read-only or action-capable`
- `Risk level`
- `Dependency status`

### Empty State

No future integrations mapped yet. Start with read-only candidates only.

### Primary Action

`View Integration Path`

### Future Automation Potential

- Show roadmap state from a structured integration registry
- Separate read-only sync from human-approved actions

---

## E. Information Architecture

### Level 1

Current state, current stage, and next action.

This is the first thing AVIN should see.

### Level 2

Architecture layers, trigger map, and open-source queue.

This level explains how the OS is organized and what is currently moving.

### Level 3

Project cards, review notes, and lifecycle logs.

This level supports detailed inspection and evidence-backed review.

### Level 4

Future integrations, API plans, MCP plans, and Hermes plans.

This level stays visible as a roadmap, not as an active runtime surface in v1.

---

## F. State Model

### Candidate Status

- Candidate Added
- Project Card Created
- Document Only Review Completed
- Practical Trial Ready
- Sandbox Review Needed
- Watching
- Archived

### Workflow Status

- Watch
- Document Only
- Practical Trial
- Sandbox Test
- Localize
- Completed
- Rejected
- Archived

### Risk Status

- Low
- Medium
- High
- Critical
- Unknown

### Review Status

- No Review Needed
- AVIN Review Needed
- Approved
- Needs Edit
- Rejected
- Waiting for More Info

These status sets should stay consistent across dashboard cards, project templates, review notes, and completion logs.

---

## G. Data Sources

Version 1 should treat these files and folders as source inputs:

- `docs-index.md`
- `00-project-log/`
- `00-meta/`
- `04-workflows/`
- `open-source-vault/candidate-batches/`
- `open-source-vault/projects/`
- `open-source-vault/reviews/`
- `open-source-vault/security-checklist.md`
- `open-source-vault/practical-trial-lane.md`
- `website/`
- `docs/llms.txt`

Important rule:

The UI should not become the new source of truth. It should reflect structured information that already lives in docs, logs, cards, and workflow files.

---

## H. Demo-first, Engineering-aware Principles

## 1. Demo-first, but engineering-aware

Start with a useful demo surface, but make sure the labels, states, and flows can later map to real data.

## 2. Data model before visual decoration

The state machine, field names, and trigger logic matter more than fancy visuals.

## 3. Modular screens

Each screen should solve one job clearly so the system can grow without rewriting everything.

## 4. Clear state machine

Candidate status, workflow status, risk status, and review status must stay explicit.

## 5. Human Review Gate

The dashboard should make approval points visible. It should not bypass AVIN review.

## 6. Static now, structured later

Version 1 can be static, but it should use stable terminology and predictable sections so later automation can attach cleanly.

## 7. Low-bug surface

Avoid early complexity such as live sync, bidirectional edits, or runtime control if a read-only or lightly interactive view is enough.

## 8. Safe extensibility

Future integrations should be planned as optional layers, not as assumptions baked into every screen.

## 9. Source of truth separation

Markdown docs, project cards, review notes, and completion logs remain the truth. The dashboard is a view layer.

## 10. Future migration path

The architecture should allow migration from static docs to generated JSON, then to read-only API sync, then to human-approved proposal workflows.

Explicit rule:

Version 1 may be a static dashboard, but its data structure, screen modules, state fields, and trigger conditions should be designed so they can later connect to GitHub API, Notion API, MCP, and Hermes Agent without a full rewrite.

---

## I. Static Dashboard v1 Proposal

This section describes a proposal for `website/os-control-panel.html`. It does not create the file.

### Layout

- Top mission header
- Two-column desktop layout
- Single-column mobile fallback
- Left side for high-level state
- Right side for queue, reviews, and next actions

### Sections

- Mission Control hero
- Current Stage card
- Next Action card
- Architecture Map card grid
- Trigger Map panel
- Open-source Vault Queue table
- Workflow Experiment Board lanes
- Review Gate panel
- Future Integration panel

### Cards

- `Current Stage`
- `Main Focus`
- `Latest Completed Layer`
- `Open Reviews`
- `Candidate Queue`
- `Highest Risk Item`
- `Next Recommended Action`

### Data Fields

- `Stage`
- `Focus`
- `Layer status`
- `Candidate count`
- `Review count`
- `Risk level`
- `Workflow status`
- `Owner`
- `Next action`
- `Last updated`

### Button Labels

- `Open Docs Index`
- `View Architecture`
- `Open Vault Queue`
- `Review Candidate`
- `Read Review Note`
- `See Next Action`
- `View Future Integrations`

### Empty States

- `No candidate repos yet. Add a candidate batch first.`
- `No review items waiting. Continue with the next workflow experiment.`
- `No practical trials ready. Complete document-only review first.`
- `No integration target selected yet. Stay static-first for now.`

### Mobile Readability Notes

- Keep cards stacked vertically
- Put status labels before description text
- Avoid wide tables without a mobile card fallback
- Collapse trigger map into grouped sections
- Keep primary action buttons short and obvious

### Dark Tech Visual Direction

- Dark graphite or deep slate background
- Soft cyan, steel blue, and muted amber for status accents
- Minimal neon use
- Clear borders and strong contrast
- More mission board than enterprise admin panel

The visual tone should feel focused, technical, and calm, not noisy or overly futuristic.

---

## J. Future Engineering Path

### Phase 0 | Reference Research

Collect external UI and control-plane references.

### Phase 1 | UI/UX Architecture Spec

Define screens, data model, state fields, trigger map, and non-goals.

### Phase 2 | Static GitHub Pages Dashboard

Build a static visual page from manually structured content.

### Phase 3 | `dashboard-data.json`

Move repeating dashboard content into a structured local data file.

### Phase 4 | GitHub Action auto-generates dashboard data

Generate counts, links, statuses, and recent changes from repo files automatically.

### Phase 5 | GitHub / Notion API read-only sync

Add controlled read-only data pulls where helpful.

### Phase 6 | MCP / Hermes proposal layer

Allow future Hermes or MCP-connected components to propose items, not execute actions by default.

### Phase 7 | Human-approved actions only

Any write, publish, or integration action must remain behind explicit AVIN approval.

---

## K. Risks and Non-goals

### Risks

- The UI becomes a new source of truth instead of a view layer
- Static demo data is hardcoded too heavily
- State names drift across docs and UI
- API integration starts too early
- MCP integration starts too early
- Agents are allowed to execute too early
- The frontend becomes too complex
- The control panel feels like an engineering backend that AVIN does not want to open every day

### Non-goals

- SaaS
- Multi-user
- Auth
- Billing
- Full backend
- Auto-publish
- Agent auto-run
- Production-grade API integration in v1

---

## Working Conclusion

AVIN OS Control Panel should begin as a static-first, state-aware, human-reviewed mission board for AI Digital Footprint OS.

The first version does not need runtime power. It needs clarity.

If the architecture is clean now, future engineering can remain safe, modular, and reversible.
