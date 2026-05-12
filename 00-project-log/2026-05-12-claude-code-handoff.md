# Claude Code Handoff: Gawk Dev Carousel Workflow State

Date: 2026-05-12
Type: Handoff / Continuation
Status: Ready for Claude Code takeover

---

## 1. Current State

- The Gawk Dev carousel pre-publish intermediate closure has already been formalized into AVIN AI Digital Footprint OS documents.
- The latest completed docs update is commit `03fa9591dcc11e4a8edfc84c105fefb2a9437cb2`.
- Branch: `main`
- Remote: `origin/main`
- Working tree note: there is still an untracked `open-source-vault/` directory in `git status`.

---

## 2. Most Recent Completed Work

- Added or refreshed the carousel production tracking document:
  - `06-platform-outputs/carousel-production/2026-05-11-gawk-dev-carousel-production-tracking.md`
- Added or refreshed the conversation closure workflow:
  - `04-workflows/conversation-closure-and-notion-log-workflow.md`
- Added or refreshed the external skill evaluation workflow:
  - `04-workflows/external-skill-evaluation-workflow.md`
- These changes were pushed successfully to `origin/main`.

---

## 3. Current Guardrails

- Do not modify website HTML unless a later task explicitly requires it.
- Do not modify GitHub Actions workflows unless a later task explicitly requires it.
- Do not modify `open-source-vault/`.
- Do not stage or commit `open-source-vault/`.
- If `git status` shows `?? open-source-vault/`, leave it untouched.

---

## 4. Immediate Next Likely Tasks

- Publish the Instagram carousel if it has not been published yet.
- Save the Instagram post URL.
- Write the published URL back into the production tracking document if needed.
- Update Notion status.
- Update GitHub lifecycle status.
- If the post is fully complete, create a lifecycle completion log.

---

## 5. Recommended Read Order For Claude Code

1. `00-project-log/2026-05-12-claude-code-handoff.md`
2. `06-platform-outputs/carousel-production/2026-05-11-gawk-dev-carousel-production-tracking.md`
3. `04-workflows/conversation-closure-and-notion-log-workflow.md`
4. `04-workflows/external-skill-evaluation-workflow.md`
5. `04-workflows/external-carousel-skill-test-plan.md`
6. `06-platform-outputs/carousel-final-versions/2026-05-11-gawk-dev-ai-tool-status-radar-final-carousel.md`
7. `06-platform-outputs/carousel-test-results/2026-05-11-gawk-dev-carousel-comparison-note.md`

---

## 6. Operational Notes

- `docs-index.md` already includes the two workflow documents and the carousel production tracking document.
- `docs-index.md` now also includes this handoff file for discoverability.
- Keep future updates minimal and lifecycle-oriented unless the task explicitly reopens strategy.

---

## 7. Claude Code Start Prompt

```text
Continue from the current AVIN AI Digital Footprint OS state.

Read first:
1. 00-project-log/2026-05-12-claude-code-handoff.md
2. 06-platform-outputs/carousel-production/2026-05-11-gawk-dev-carousel-production-tracking.md
3. 04-workflows/conversation-closure-and-notion-log-workflow.md
4. 04-workflows/external-skill-evaluation-workflow.md

Important guardrails:
- Do not touch open-source-vault/
- Do not stage or commit open-source-vault/
- Do not change website HTML or GitHub Actions unless explicitly required

Primary continuation goal:
- Finish the Gawk Dev carousel lifecycle cleanly from publish to URL writeback to Notion / GitHub lifecycle completion.
```
