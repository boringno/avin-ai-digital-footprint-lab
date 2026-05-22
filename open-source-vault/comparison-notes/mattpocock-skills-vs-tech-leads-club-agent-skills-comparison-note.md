# mattpocock/skills vs tech-leads-club/agent-skills｜Focused Comparison Note

## 1. Comparison Metadata

| Field | Value |
|-------|-------|
| Target Repos | mattpocock/skills · tech-leads-club/agent-skills |
| Comparison Type | Focused Two-way Comparison |
| Date | 2026-05-22 |
| Reviewer Context | AVIN AI Digital Footprint OS / open-source-vault |
| Review Mode | Document-only — no install, no clone, no execution, no API |
| Predecessor | `open-source-vault/reviews/agent-skills-comparison-note.md` (three-way: mattpocock vs tech-leads-club vs obra) |

**Scope Boundary:**
This note draws only from completed Document Only Reviews and the tech-leads-club Security Checklist.
No new runtime information was gathered. All assessments are inferred from public documentation.

---

## 2. Current Status

| Dimension | mattpocock/skills | tech-leads-club/agent-skills |
|-----------|------------------|------------------------------|
| Document Only Review | Completed | Completed |
| Security Review | Not started | Completed — Not Fully Cleared |
| Practical Trial | Not Started | **Blocked** (9 preconditions unmet) |
| Decision | Watch | Watch |
| Install Status | Not installed | Not installed |
| MCP Connected | No | No |

**Key asymmetry:** tech-leads-club has gone further in the review pipeline but its Security Checklist raised unresolved blockers. mattpocock has not yet started Security Checklist, meaning its risk surface is not yet characterized.

---

## 3. Project Positioning Comparison

### mattpocock/skills — Personal Minimal Skill Collection

- **What it is:** A personal repository of reusable agent skills, workflow prompts, and coding conventions maintained by one person (Matt Pocock, TypeScript educator).
- **Design philosophy:** Minimal, direct, optimized for personal use. Skills are static files organized into categories.
- **Governance:** None documented. No formal security audit, no intake pipeline, no versioning protocol.
- **Target user:** Individual developers who work with Claude Code or similar coding agents and want composable skill units.
- **Skill categories (visible):** `deprecated`, `engineering`, `in-progress`, `misc`, `personal`, `productivity`

### tech-leads-club/agent-skills — Enterprise Security-Audited Skills Marketplace

- **What it is:** A governed, organization-maintained marketplace of agent skills with multi-layer security auditing.
- **Design philosophy:** Security-first, enterprise-grade. Skills pass Snyk Agent Scan + human review + static analysis before publication. Dynamic discovery via MCP server.
- **Governance:** Three-layer audit (Snyk + human review + static analysis). Skills have version numbers and are tracked under `skills-catalog-v0.14.3`.
- **Target user:** Teams and enterprises that need agent skills they can trust in production environments.
- **Discovery mechanism:** MCP server with 3 tools (`list_skills`, `search_skills`, `read_skill`)

### Positioning Summary

| Axis | mattpocock/skills | tech-leads-club/agent-skills |
|------|------------------|------------------------------|
| Orientation | Skill **content** pattern | Skill **system / discovery / MCP** pattern |
| Maintainer type | Individual | Organization |
| Scale | Small, personal | 4,100 stars, 357 forks |
| Philosophy | "Here are skills I use" | "Here are skills we've audited" |
| Localize complexity | Low (static files) | High (needs platform + MCP) |
| Content richness | Rich (engineering, productivity, TDD, handoff) | Rich (audited skill library) |

---

## 4. Structure Comparison

### Skill File Structure

**mattpocock/skills (inferred from visible repo structure):**
- Skills organized as categorized files under `skills/`
- Categories: `engineering/`, `productivity/`, `misc/`, `personal/`
- Supporting files: `CLAUDE.md`, `CONTEXT.md`, `docs/adr/`, `.claude-plugin`
- Each skill appears to be a self-contained instruction file
- Naming convention: descriptive names (inferred from category names like TDD, grilling, triage, handoff)

**tech-leads-club/agent-skills (inferred from documentation):**
- Skills stored in a versioned catalog (`skills-catalog-v0.14.3`)
- Access via MCP query, not direct file browsing
- Skills have gone through a formal intake process
- No visible top-level structure (platform-managed, not directory-browsed)

### AVIN Localization Feasibility

| Localize Factor | mattpocock/skills | tech-leads-club/agent-skills |
|----------------|------------------|------------------------------|
| Can borrow individual skill files | Yes (static files) | No (platform-managed catalog) |
| Can borrow folder structure pattern | Yes | Not directly applicable |
| Can borrow naming conventions | Yes | Partially (catalog naming) |
| Can borrow governance model | No (no governance to borrow) | Yes (audit pipeline as design reference) |
| Can borrow MCP design | No (no MCP) | Yes (3-tool minimal surface pattern) |
| Effort to localize a single pattern | Low | Medium (conceptual extraction only) |

### Agent Task Spec Pattern Potential

**mattpocock/skills** is more directly relevant to Agent Task Spec pattern development:
- Individual skill files with discrete scope map naturally to AVIN's task card structure
- The `engineering/` category likely contains patterns useful for Agent Task Handoff and Guarded Long Task design
- `CONTEXT.md` and `CLAUDE.md` co-existence pattern echoes AVIN's own project memory design

**tech-leads-club/agent-skills** contributes to Agent Task Spec at the governance layer:
- The concept of "audited before callable" directly applies to how AVIN should treat any external skill before it enters the AVIN workflow layer
- The `list → search → read` MCP pattern is a possible model for a future AVIN skill discovery interface

---

## 5. Workflow Fit to AVIN OS

| AVIN Layer | mattpocock/skills | tech-leads-club/agent-skills |
|------------|------------------|------------------------------|
| open-source-vault | Strong — exemplar of "individual minimal skill repo" category | Strong — exemplar of "enterprise governed marketplace" category |
| Agent Task Handoff | Medium — skill files may contain handoff patterns worth studying | Low-Medium — discovery pattern more relevant than content pattern |
| Guarded Long Task Protocol | Low-Medium — individual skill scope boundaries are relevant to "bounded task" design | Low-Medium — pre-audit concept aligns with "pre-approved action" principle |
| Human Relay Long Task | Low — no direct analog; this is an AVIN-specific protocol | Low — no direct analog |
| Agent-to-Agent Micro Step Protocol | Medium — small composable skill units map to micro-step design | Medium — `list → search → read` is a 3-step minimal interface worth studying |
| Platform Compatibility Layer | Medium (Windows npx uncertainty) | Medium-High (Shell 2.3%, Windows cache path uncertainty) |

**Summary:** Both repos contribute most strongly to `open-source-vault` as reference material. mattpocock has stronger direct content relevance for AVIN's task-spec and workflow layers. tech-leads-club has stronger relevance for governance model and MCP surface design.

---

## 6. What Can Be Learned

### From mattpocock/skills

| Pattern | Value | Notes |
|---------|-------|-------|
| Skill as a discrete, bounded file unit | High | Each skill stays small and composable — maps to AVIN's task card principle |
| Category-based skill organization | Medium | `engineering/`, `productivity/`, `misc/` is a reusable organizational pattern |
| `CONTEXT.md` as a persistent skill context file | High | Parallels AVIN's own project memory files; demonstrates the pattern works in practice |
| Engineering skill patterns (TDD, grilling, handoff) | Medium | Worth studying to understand what "well-scoped agent skill" looks like before writing AVIN's own |
| Minimal install footprint (npx) | Medium | Demonstrates that a useful skill system can be distributed without global install or platform infrastructure |

### From tech-leads-club/agent-skills

| Pattern | Value | Notes |
|---------|-------|-------|
| Three-layer intake audit (Snyk + human + static analysis) | High | Design reference for AVIN's open-source-vault intake governance — not for adoption, for inspiration |
| Minimal MCP surface (3 tools) | High | Contrast with rohitg00's 53-tool surface; 3-tool design shows restraint is achievable |
| Dual licensing (MIT software + CC-BY-4.0 content) | Medium | A practical model for separating platform code license from content license |
| Human review gate as a published design principle | High | The platform publicly commits to human review before publication — AVIN should adopt this principle for its own skill intake |
| Skill discovery as a first-class interface | Medium | `list → search → read` as a discovery pattern separates "knowing skills exist" from "using a skill" |

---

## 7. What Should Not Be Adopted

- **Do not import either repo's skills into `skills/` directly.** No external skill enters AVIN's runtime without full review and AVIN approval.
- **Do not install either tool** (npm global, npx, or any other method) without completing the respective Security Checklist and sandbox design.
- **Do not treat any skill content from either repo as trusted instructions.** Skill files from external repos are data to read and study, not instructions to execute.
- **Do not skip Security Checklist.** mattpocock/skills has not had a Security Checklist yet. tech-leads-club/agent-skills Security Checklist is completed but Not Fully Cleared.
- **Do not substitute external skill patterns for AVIN's existing governance.** Rule 12, Agent Task Spec Template, and Guarded Long Task Protocol are AVIN-internal documents. External patterns are reference material only.
- **Do not use the comparison note as a shortcut to localization.** A separate localization proposal is required before any pattern is adopted into AVIN's runtime layer.

---

## 8. Security and Trial Boundary

| Boundary | mattpocock/skills | tech-leads-club/agent-skills |
|----------|------------------|------------------------------|
| Security Checklist | **Not started** | Completed — **Not Fully Cleared** |
| Practical Trial | Not started — blocked until Security Checklist | **Blocked** — 9 preconditions unmet |
| MCP Connection | Not applicable | **Blocked** |
| Install | Not approved | **Not approved** |
| Pattern localization | Requires AVIN approval + localization proposal | Requires AVIN approval + localization proposal |

**For mattpocock/skills:** The Security Checklist is the next required step before any trial. Given the simpler architecture (static files, npx), it is likely to have a lower risk surface than tech-leads-club, but this cannot be assumed without review.

**For tech-leads-club/agent-skills:** The three most critical blockers from the Security Checklist are:
1. `read_skill` implicit escalation risk (external content enters agent context without filtering)
2. `~/.cache/agent-skills/` cleanup path unconfirmed
3. Shell script (2.3%) Windows compatibility unconfirmed

**Localization boundary:** Any localized pattern must be extracted at the conceptual level — rewriting in AVIN's own words and structure — not copying skill content or tool code directly.

---

## 9. Localization Candidate Patterns

These are candidates only. None are adopted. All require AVIN approval before any implementation.

### Candidate 1: Skill Card Format (from mattpocock/skills)

**What it is:** Each skill as a self-contained, bounded instruction file with a clear name, scope, and purpose.

**What to localize:** The structural principle that "a skill = one file, one purpose, named for what it does, no external dependencies." This can inform how AVIN formalizes its own internal skill or task pattern files.

**Status:** Candidate — Not adopted — Requires AVIN approval

---

### Candidate 2: Human Review Gate as a Published Commitment (from tech-leads-club/agent-skills)

**What it is:** The platform publicly commits that every skill passes human review before it is accessible to agents.

**What to localize:** The principle that any external content retrievable by AVIN's agent must first pass a human review gate before the agent is permitted to act on it. This applies to `read_skill` output, any open-source skill file, and any external prompt content.

**Status:** Candidate — Not adopted — Requires AVIN approval

---

### Candidate 3: Minimal MCP Surface Constraint (from tech-leads-club/agent-skills)

**What it is:** Deliberately limiting a skill system's MCP interface to 3 tools (`list → search → read`), rejecting the impulse to expose every function as a tool.

**What to localize:** The design principle that AVIN's future MCP integrations should aim for minimal tool surface — each tool with a clearly bounded read-only scope — rather than exposing broad functionality. This informs future MCP Potential Checklist evaluations.

**Status:** Candidate — Not adopted — Requires AVIN approval

---

## 10. Decision Matrix

| Dimension | mattpocock/skills | tech-leads-club/agent-skills |
|-----------|------------------|------------------------------|
| Fit to AVIN OS | Medium-High (content + structure patterns) | Medium (governance + MCP patterns) |
| Risk | Medium (uncharacterized — no Security Checklist yet) | Medium (characterized — Not Fully Cleared) |
| Install Readiness | Blocked — Security Checklist needed | Blocked — 9 preconditions unmet |
| Localize Readiness | Low (Security Checklist needed first) | Low (blockers must be resolved first) |
| Comparison Value | High (exemplar of individual minimal design) | High (exemplar of enterprise governed design) |
| Content Material Value | Medium (personal skill design angle) | Medium (enterprise governance angle, MCP) |
| Next Action | Security Checklist | Monitor for resolution of 3 key blockers |

---

## 11. Recommendation

### Which to localize pattern from first

**mattpocock/skills is the better near-term localization target**, specifically for Candidate 1 (Skill Card Format), because:
- Architecture is simpler (static files, no platform dependency)
- Security surface is more predictable once the Checklist runs
- The skill structure pattern can be extracted conceptually without any installation
- The `CONTEXT.md` pattern has immediate relevance to AVIN's existing project memory design

However, localization must not begin until the mattpocock/skills Security Checklist is complete.

### Which to continue Watch

Both should remain at **Watch**:
- **mattpocock/skills:** Watch + Security Checklist Needed
- **tech-leads-club/agent-skills:** Watch + Security Checklist Not Fully Cleared

### Security Checklist need

- **mattpocock/skills:** Security Checklist is the clear next step. Expected to be lower risk than tech-leads-club, but not confirmed.
- **tech-leads-club/agent-skills:** Security Checklist completed but 3 blockers remain open.

### Practical Trial

Neither repo is ready for Practical Trial:
- mattpocock: Security Checklist not run
- tech-leads-club: 9 safety preconditions unmet

---

## 12. Next Actions

In priority order:

1. **mattpocock/skills Security Checklist** — primary next action for this comparison to advance. Once complete, can assess whether Candidate 1 (Skill Card Format) localization is safe to propose.

2. **Localization Proposal: Skill Card Format** — after mattpocock Security Checklist, if cleared, write a localization proposal for the skill card structure principle. This is a document-only output: a proposed AVIN-internal skill card format derived from mattpocock patterns, not a copy of any external file.

3. **Localization Proposal: Human Review Gate** — after both Security Checklists are complete, formalize Candidate 2 as an AVIN design principle for any future agent-accessible external content.

4. **Monitor tech-leads-club blockers** — if the 3 key blockers (read_skill escalation, cache cleanup, Shell Windows compatibility) are resolved in a future version, the Security Checklist can be reopened. No action needed now.

5. **Do not start Practical Trial** for either repo until at minimum:
   - mattpocock: Security Checklist completed and cleared
   - tech-leads-club: All 9 preconditions satisfied
