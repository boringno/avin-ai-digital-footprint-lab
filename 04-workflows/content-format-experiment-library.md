# Content Format Experiment Library

## 1. Purpose
This library is not a collection of "viral formulas." It is a systematic framework for conducting **Content Format Experiments**. 

The goal is to move beyond chasing random viral hits and instead build a library of validated patterns categorized by content type, audience intent, and platform context. This system ensures that performance is analyzed through human interpretation combined with raw metrics, preventing the team from "overfitting" to outliers.

## 2. Core Principle
*   **Do not overfit one viral post:** A single high-performing post is often the result of timing, topic relevance, and platform distribution, not just the format.
*   **Single high-performing post is not automatically a repeatable pattern:** Success must be replicated across different topics within the same category before being considered "repeatable."
*   **Format confidence must be earned through repeated tests:** Confidence levels scale with sample size and consistency.
*   **Same platform does not mean same format:** Even within Threads, different content goals require different structural approaches.
*   **Different content categories need different opening and ending patterns:** A "Knowledge" post and a "Meme" require fundamentally different hooks and call-to-actions.

## 3. Content Categories

| Category | Purpose | Opening Direction | Ending Direction | Key Metrics |
| :--- | :--- | :--- | :--- | :--- |
| **Knowledge** | Teach a concept or workflow | Problem-first or Result-first | Workflow Takeaway / Save-worthy | Quotes, Shares |
| **Tool Test** | Report on AI tool experiments | Result-first (The "Wow" factor) | Save-worthy Checklist | Likes, Shares |
| **Exploration Log** | Share "building in public" progress | Confession-first or Story-first | Open Question / Lifecycle Note | Replies |
| **Timing / Hot Take** | React to breaking news/trends | Timing-first or Contrarian | Personal Stance | Views, Replies |
| **Meme** | Relatable humor / cultural signal | Meme-first | Open Question | Likes, Reposts |
| **Opinion** | Share a strong unique perspective | Contrarian or Story-first | Personal Stance / Open Question | Replies, Quotes |
| **Case Study** | Deep dive into a specific project | Result-first or Problem-first | Workflow Takeaway | Shares, Quotes |
| **Progress Log** | Low-stakes update on milestones | Story-first | Personal Stance | Likes, Replies |

## 4. Opening Types
The "Hook" that stops the scroll in the Notion `Opening Type` field:

*   **Contrarian:** Challenging a popular belief.
*   **Problem-first:** Highlighting a specific pain point.
*   **Result-first:** Showing the end product/achievement immediately.
*   **Story-first:** Narrative-driven beginning.
*   **Question-first:** Engaging the audience with a prompt.
*   **Meme-first:** Using visual humor or a cultural reference.
*   **Timing-first:** Directly referencing a current event.
*   **Confession-first:** Sharing a personal failure or vulnerable insight.

## 5. Ending Types
The "Closer" that drives the desired action in the Notion `Ending Type` field:

*   **Summary:** Distilling the post into a few bullet points.
*   **CTA:** Clear instruction (Follow, Join, Click).
*   **Open Question:** Prompting a reply.
*   **Personal Stance:** A final "so what" from AVIN's perspective.
*   **Workflow Takeaway:** A practical step the reader can take.
*   **Save-worthy Checklist:** Information designed to be bookmarked.
*   **Lifecycle Note:** Context on where this fits in the Digital Footprint OS.

## 6. Format Confidence
A measure of how much we trust this specific format to perform, tracked in Notion:

*   **Exploring (Default):** First or second test of a new format idea.
*   **Promising:** Showed good results in 1-2 tests; worth more samples.
*   **Repeatable:** Consistently performs well across different topics.
*   **Category-specific:** A "Go-to" format for a specific content category (e.g., Knowledge).
*   **Rejected:** Failed to gain traction after multiple attempts.
*   **Outlier:** High performance that we suspect is not due to the format (e.g., extreme viral hit).

**Crucial Rule:** A single viral post can only be marked as **Outlier** or **Promising**. It **cannot** be marked as **Repeatable** until it has succeeded at least 3-5 times with different topics.

## 7. Performance Interpretation
This is a **human-judged** field. Numbers (API metrics) tell us *what* happened, but this field explains *why*:

*   **Timing-driven:** Success due to being first or fast on a topic.
*   **Topic-driven:** Success due to the inherent interest in the subject.
*   **Format-driven:** Success due to the structural "Hook" and "Flow."
*   **Audience-driven:** Success due to resonance with a specific sub-group.
*   **Platform-driven:** Success due to the algorithm favoring a specific media type.
*   **Topic + Timing-driven:** The "Perfect Storm" of relevant subject at the right time.
*   **Unknown / Needs Review:** Metrics are high/low but the reason is unclear.

## 8. Suggested Workflow

### Before Publishing (Hypothesis Phase)
1.  Define **Content Category**.
2.  Define **Format Pattern** (e.g., Short text + 1 Image).
3.  Select **Opening Type** and **Ending Type**.
4.  Write a **Format Hypothesis** (e.g., "Problem-first hook will drive more saves for this tool test").

### After Publishing (Validation Phase)
1.  Wait for **Metrics Writeback** (via `sync_threads_insights.py`).
2.  Record **Performance Interpretation**.
3.  Add **Performance Notes** (qualitative observations).
4.  Check **Reusable Pattern** if elements are worth repeating.
5.  Check **Do Not Overfit** if the success seems like an outlier.
6.  Update **Format Confidence**.

## 9. Example: Viral Threads Post
*   **Post ID:** `17935258965186803`
*   **Status:** High-performing outlier.
*   **Interpretation:** **Topic + Timing-driven**.
*   **Action:** `Do Not Overfit` checked.
*   **Lesson:** While the performance was exceptional, we do not assume the writing structure alone will reproduce these results. Reusable elements identified: *Timing sensitivity* and *emotional relevance*.

## 10. Relationship with Threads / IG / LinkedIn
A single idea should be adapted, not just copy-pasted:

*   **Threads:** High frequency, opinion-heavy, reactive, and conversation-starting.
*   **Instagram:** Visual-first, high-production carousels or reels with strong immediate hooks.
*   **LinkedIn:** Professional narrative, structured insights, and clear "Value-add" for career/workflow.

## 11. Relationship with Skills / Open Source Tools
AVIN's AI Digital Footprint OS focuses on the **Content Experiment Logic**. 

While open-source tools (e.g., BrightBean Studio, TryPost) are valuable for scheduling and multi-platform distribution, they are secondary to this system. We prioritize:
1.  **Human Interpretation:** Machines provide metrics; AVIN provides meaning.
2.  **Notion + GitHub Lifecycle:** Treating content as a versioned asset.
3.  **Public Trace:** Documenting the *learning* process, not just the *output*.

We do not add these tools as dependencies. We observe their workflows and integrate their best logic into our local scripts only when necessary.

## 12. Acceptance Criteria
- [ ] Notion format experiment fields are used according to these definitions.
- [ ] Every high-performing post is checked against the "Overfitting" risk.
- [ ] Content categories are clearly defined before publication.
- [ ] Format confidence only increases after 3-5 successful samples.
- [ ] No automation decides format success without manual interpretation.
