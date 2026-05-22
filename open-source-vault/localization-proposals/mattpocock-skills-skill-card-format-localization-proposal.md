# Skill Card Format Localization Proposal｜mattpocock/skills Pattern

## 1. Proposal Metadata

| Field | Value |
|-------|-------|
| Source Repo | https://github.com/mattpocock/skills |
| Proposal Type | Pattern Localization Proposal |
| Date | 2026-05-22 |
| Review Basis | Document Only Review + Security Checklist + Focused Comparison Note |
| Scope Boundary | Pattern extraction only. No external skill content copied. No installation. No execution. |
| Status | **Proposal — Not an adoption decision.** Requires AVIN approval before any template implementation. |

---

## 2. Current Evidence

| Stage | Status |
|-------|--------|
| Document Only Review | Completed (2026-05-18) |
| Security Checklist | Completed (2026-05-22) — **Partially Cleared for Pattern Review** |
| Focused Comparison Note | Completed (2026-05-22) — identified as preferred localization candidate |
| Practical Trial | **Blocked** — `.claude-plugin`, `scripts/`, `add` command behavior not confirmed |
| Install Status | Not installed |
| MCP Connected | No |
| External Skill Content in AVIN | No — none has been copied or executed |

**Security Checklist key conclusions:**
- Execution (`npx`) remains blocked
- Document-only pattern study is cleared
- `.claude-plugin` must not be copied into AVIN's working directory
- Pattern-only localization may proceed with AVIN approval

---

## 3. Why Skill Card Format (Pattern Only)

### Why localize format and not full skill content

| Reason | Detail |
|--------|--------|
| External content is untrusted input | Skill files from mattpocock/skills are designed as agent instructions. If placed directly in AVIN's agent context, they will be executed as directives, not studied as reference. |
| npx execution is not cleared | The `npx skills@latest add` command behavior is unverified. Installation remains blocked. |
| `.claude-plugin` risk | If files from the external repo are copied into AVIN's working directory, the `.claude-plugin` file could auto-activate in Claude Code, changing AVIN's agent behavior without explicit intent. |
| Pattern is the transferable value | The structural insight — each skill as a bounded, named, scoped unit — is the reusable asset, not any specific skill instruction. |
| AVIN OS needs its own internal format | mattpocock's skills are designed for his personal coding workflow. AVIN's skill cards need to fit AVIN's protocols: Guarded Long Task, Human Relay, Agent Task Handoff, and open-source-vault governance. |

**Core principle:** Study the structure. Rewrite in AVIN's language. Do not copy external instructions.

---

## 4. Proposed AVIN Skill Card Format

The following field set is a candidate for AVIN's internal skill card format. It draws structural inspiration from the observable patterns in mattpocock/skills (bounded files, clear scope, discrete purpose) while being defined in AVIN's own operational terms.

```markdown
---
skill_name: [Short, descriptive name — what the skill does]
version: [e.g., v0.1]
adoption_status: [Proposal / Internal Draft / Approved / Deprecated]
platform_compatibility: [All / Windows-only / macOS-only / Partial — see notes]
last_reviewed: [YYYY-MM-DD]
---

## Purpose
[One sentence: what this skill enables an agent to do.]

## Use Case
[When should this skill be invoked? What scenario does it address?]

## Trigger Condition
[What signal or request causes this skill to activate?
Be specific: task type, user phrase, document state, or system event.]

## Input Needed
[What information must the agent have before starting?
List required inputs and their sources.]

## Allowed Actions
[Explicit list of what the agent MAY do when executing this skill.
Everything not listed here is implicitly forbidden.]

## Forbidden Actions
[Explicit list of what the agent MUST NOT do.
Include common drift patterns to prevent.]

## Stop Conditions
[When must the agent stop and wait for human input?
List specific states, errors, or ambiguous conditions.]

## Output Format
[What should the agent produce?
Describe format, length, and destination (e.g., file, inline response, commit).]

## Verification
[How does the agent or human confirm the skill was executed correctly?
List specific checks or commands.]

## Human Review Gate
[Is human review required before the agent acts, after the agent acts, or at a specific mid-point?
Default: Yes for any action with external effects.]

## Platform Compatibility Notes
[Any Windows vs macOS differences that affect this skill's behavior.
If uncertain, mark as Platform Compatibility Required.]

## Security Notes
[Any credential, file access, network, or injection risks specific to this skill.
Reference relevant Security Checklist if applicable.]

## Related Workflows
[Links to related AVIN documents: task specs, protocols, workflow files.]

## Source Inspiration
[If this skill was inspired by an external repo or pattern, cite it here.
Example: "Structural pattern derived from mattpocock/skills (document-only study).
No external content copied."]

## Adoption Notes
[Current adoption status and any conditions for promotion to a higher status.]
```

---

## 5. Field Definitions

| Field | Purpose | Operability |
|-------|---------|-------------|
| `skill_name` | Unique identifier and human-readable label | Used in index, handoff docs, task specs |
| `version` | Tracks iteration; starts at v0.1 for proposals | Enables comparison across revisions |
| `adoption_status` | Controls whether the skill is in active use | Gate for promotion / deprecation |
| `platform_compatibility` | Explicit platform scope | Prevents silent Windows/macOS failures |
| `last_reviewed` | Freshness signal | Triggers re-review if stale |
| `Purpose` | One-sentence capability statement | Allows fast scanning in an index |
| `Use Case` | Scenario context | Disambiguates similar skills |
| `Trigger Condition` | Specific activation signal | Prevents accidental invocation |
| `Input Needed` | Pre-condition checklist | Agent cannot start without confirmed inputs |
| `Allowed Actions` | Explicit permission boundary | Closes the implicit "anything goes" gap |
| `Forbidden Actions` | Explicit prohibition list | Prevents known drift patterns |
| `Stop Conditions` | Human handoff triggers | Core to Guarded Long Task + Human Relay |
| `Output Format` | Deliverable specification | Enables verification |
| `Verification` | Completion check | Supports Guarded Long Task protocol |
| `Human Review Gate` | Control point placement | Required for any action with external effects |
| `Platform Compatibility Notes` | Environment delta | Prevents platform-specific silent failures |
| `Security Notes` | Per-skill risk reminder | Links to Security Checklist when applicable |
| `Related Workflows` | Cross-reference | Maintains coherence with AVIN OS |
| `Source Inspiration` | Provenance tracking | Documents external influence without importing content |
| `Adoption Notes` | Governance record | Tracks how and when this skill was promoted |

---

## 6. Example Skill Card Draft

This example demonstrates the proposed format using an AVIN-internal concept. No external skill content has been used.

---

```markdown
---
skill_name: Human Relay Long Task Commander
version: v0.1
adoption_status: Internal Draft
platform_compatibility: All
last_reviewed: 2026-05-22
---

## Purpose
Guide an AI agent through a multi-step task where AVIN acts as the human relay between model sessions,
manually transferring outputs and approving each checkpoint before the next step begins.

## Use Case
When a task is too long for a single model session, or when multiple model handoffs are needed
(e.g., Codex → Claude Code), and AVIN wants to maintain control at every commit / push boundary.

## Trigger Condition
User (AVIN) sends a task with the header:
"本任務採用 Human Relay Long Task。"

## Input Needed
- Task name and objective
- Approved file scope (can new / modify which files)
- Prohibited file scope
- Expected commit message
- Stop conditions
- push approval policy

## Allowed Actions
- Read-only git checks (pwd, branch, status, fetch, rev-list)
- Create approved files
- Minimally update docs-index.md (1 entry only)
- Precise git add of named files
- git commit with specified message
- git merge --ff-only if remote ahead on docs-index.md only

## Forbidden Actions
- git add .
- git push without explicit AVIN approval
- git rebase, reset, clean, stash, force push
- Modify any file outside approved scope
- Create any folder outside approved scope
- Clone, install, run scripts, connect APIs

## Stop Conditions
- worktree dirty (unexpected changes)
- origin/main diverged
- Remote new commit modifies files other than docs-index.md
- Any file outside approved scope appears in diff
- docs-index.md change is more than 1 line
- BOM / encoding anomaly detected

## Output Format
After commit: structured report covering items A–N (or as specified in task brief).
Format: markdown table or labeled list.

## Verification
- git status --short → empty
- git rev-list --left-right --count origin/main...main → 0 1
- git diff --name-only origin/main..main → only approved files
- git show --stat --oneline [hash] → matches expected changes

## Human Review Gate
Required before every push.
AVIN must explicitly say "核准 push" after reviewing the verification report.

## Platform Compatibility Notes
Tested on Windows (Git Bash / PowerShell) and should be compatible with macOS.
Path separator differences: use forward slashes in git commands.

## Security Notes
No external content fetched. No credentials used.
All changes are local until AVIN approves push.

## Related Workflows
- `00-meta/codex-claude-handoff-template.md`
- `00-meta/guarded-long-task-protocol-proposal.md`
- `04-workflows/templates/agent-task-spec-template.md`

## Source Inspiration
Format structure inspired by mattpocock/skills (document-only study).
No external skill content copied.
AVIN-internal content only.

## Adoption Notes
v0.1 — Internal Draft. Requires AVIN approval before use as a formal skill card.
```

---

## 7. Localization Boundary

| Boundary | Status |
|----------|--------|
| Localize pattern only (not external full content) | ✅ This proposal contains no external skill file content |
| Do not install / run npx | ✅ No installation performed |
| Do not import into `skills/` formal layer | ✅ This is a proposal document, not a skills/ file |
| Do not treat as a formal Agent Skill | ✅ Marked as Proposal / Internal Draft |
| Requires AVIN approval for promotion | ✅ Explicitly stated in proposal and field definitions |
| External skill content = untrusted input | ✅ Stated in Section 3 and enforced in Source Inspiration field |

---

## 8. Fit to AVIN OS

| AVIN Layer | Fit | Notes |
|------------|-----|-------|
| open-source-vault | High | The Skill Card Format provides a standardized way to document open-source-vault localization candidates at the pattern level before any adoption decision |
| Agent Task Handoff | High | `Stop Conditions`, `Verification`, and `Human Review Gate` fields directly support handoff protocol requirements |
| Guarded Long Task Protocol | High | `Allowed Actions`, `Forbidden Actions`, and `Stop Conditions` mirror the Guarded Long Task pre-approval gate design |
| Human Relay Long Task | High | The Example Skill Card (Section 6) is directly about Human Relay Long Task; the format was validated through this example |
| Agent-to-Agent Micro Step Protocol | Medium | `Input Needed` + `Output Format` + `Verification` define the interface for each micro step; could support A2A protocol design |
| Platform Compatibility Layer | Medium | The `Platform Compatibility Notes` field creates a standard location for per-skill platform delta documentation |

---

## 9. Risks and Controls

| Risk | Likelihood | Control |
|------|------------|---------|
| Prompt injection via external skill content | Medium if content is copied | **Control:** `Source Inspiration` field explicitly marks external origin; no external content in any skill card |
| Over-trusting external skills (treating them as AVIN rules) | Medium without clear boundary | **Control:** `adoption_status` field gates promotion; Section 7 boundary statement |
| Format drift (field names changing across skill cards) | Medium over time | **Control:** Version field + `last_reviewed` date + this proposal as canonical reference |
| Unclear platform behavior causing silent failures | Low-Medium | **Control:** `Platform Compatibility Notes` field is explicit; mark as Required when uncertain |
| Uncontrolled adoption (skill card promoted to formal rule without review) | Low | **Control:** `adoption_status` progression: Proposal → Internal Draft → Approved requires explicit AVIN action at each stage |

---

## 10. Decision Options

| Option | Description | Recommendation |
|--------|-------------|----------------|
| Watch | Keep as reference only, no template created | Not recommended — evidence supports moving to Internal Draft |
| **Localize format only** | Create the AVIN Skill Card Template based on Section 4 | **Recommended — immediate next step** |
| Create internal template | Formalize Section 4 as a reusable `05-templates/avin-skill-card-template.md` | Appropriate after AVIN approval of this proposal |
| Promote to Agent Task Spec extension | Add skill card format as an extension to the Agent Task Spec Template | Future step — only after internal template is validated |
| Reject / archive | Do not adopt this format | Not recommended given the strong fit to AVIN OS protocols |

---

## 11. Recommendation

**Localize format only — do not install, do not import external skill content.**

The proposed Skill Card Format (Section 4) is ready for AVIN's review. If approved:

1. Create `05-templates/avin-skill-card-template.md` using Section 4 as the basis
2. The template should be a blank AVIN-internal form, not a copy of any external skill
3. The Example Skill Card (Section 6) can serve as the first validated instance

**Do not:**
- Install mattpocock/skills
- Copy any external skill file into AVIN's working directory or `skills/`
- Treat this proposal as an approved skill card itself
- Activate `.claude-plugin` from the external repo

---

## 12. Next Actions

In priority order:

1. **AVIN review and approval of this proposal** — review Sections 4, 5, 6 and decide whether the field set covers AVIN's operational needs.

2. **Create `05-templates/avin-skill-card-template.md`** (after approval) — a blank template form based on Section 4, placed in AVIN's existing templates folder, available for future skill card authoring.

3. **Validate with a second example** — write one more AVIN-internal example skill card (e.g., Document Only Review Assistant) to confirm the format is reusable before promoting to approved status.

4. **Consider Platform Compatibility Layer integration** — the `Platform Compatibility Notes` field in each skill card could reference the Platform Compatibility Layer document. Evaluate whether a formal cross-reference pattern is needed.

5. **Maintain mattpocock/skills at Watch** — keep at Watch + Partially Cleared for Pattern Review. The Practical Trial remains blocked until `.claude-plugin`, `scripts/`, and `add` command behavior are confirmed.

6. **Do not start Practical Trial** for mattpocock/skills until sandbox plan is complete.
