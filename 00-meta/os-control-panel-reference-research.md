# OS Control Panel Reference Research

## Purpose

這份文件整理 AVIN OS Control Panel 可以參考的外部 UI/UX 與架構模式。

目的不是模仿外部產品，而是吸收成熟的控制面板、agent workflow、knowledge OS、MCP intake 與 review gate 概念，幫助 AVIN 建立自己的 AI Workflow OS 控制面板。

這份研究只基於公開可見資訊，例如官方文件、GitHub repo 首頁、README、官方產品說明頁。

這不是：

- 前端設計稿
- dashboard implementation
- SaaS product plan
- MCP integration plan
- runtime adoption approval

## Research Basis

本次整理主要參考以下公開來源：

- GitHub Docs: Copilot agents / agent management
- OpenClaw official GitHub repo and docs index
- CrewAI official docs
- Logseq official blog
- MCP Registry official GitHub repo and official registry
- Code2MCP arXiv paper abstract

這不是完整源碼審計，也不是逐項實作評測。

---

## A. GitHub Agent HQ / Agents Panel

### What It Suggests

從 GitHub Copilot agents 的公開文件來看，GitHub 正在把 agent 工作流包成一種可委派、可追蹤、可 review 的 repository-native control surface。

對 AVIN 有幫助的點：

- mission control dashboard:
  集中顯示 agent sessions、工作狀態、任務入口，而不是把 agent 分散在不同頁面。
- task delegation:
  任務可以被明確交給某個 agent，而不是只有 chat input。
- agent status tracking:
  可以看進度、session log、active sessions。
- human review:
  agent 完成後仍然需要人工 review，而不是自動 merge 或自動接受。
- multiple agents / tools in one place:
  GitHub 把 model choice、custom agent、third-party agent、review flow 放在同一個操作面。

### What AVIN Should Borrow

- 將 Next Action 和 Agent Session Status 放在同一個 mission control 視角下。
- 保留人工 steering / human review 的地位。
- 將 agent 任務視為可追蹤的工作單位，而不是一段聊天紀錄。

### What AVIN Should Not Copy

- 不要照抄 GitHub 的平台級複雜度。
- 不要預設 AVIN 需要 repository-wide agent orchestration UI。
- 不要把控制面板做成開發平台本身。

對 AVIN 來說，這比較像是 mission control interaction model 參考，不是產品藍圖。

---

## B. OpenClaw / Self-hosted Agent Control Plane

### What It Suggests

從 OpenClaw 公開 repo 與 docs index 來看，它更接近 self-hosted agent control plane，而不是單純聊天 UI。

對 AVIN 有幫助的點：

- Gateway:
  明確有單一 control plane / routing layer。
- Skills:
  skill 是能力模組，不只是 prompt 片段。
- Memory:
  session、memory、routing 有單一來源。
- Tool execution:
  工具執行被視為 agent runtime 的一級能力。
- Local control:
  強調 self-hosted、own hardware、own rules。
- Security boundary:
  Gateway、workspace、channels、skills、tool execution 都是需要邊界的。

### Why It Matters for AVIN

這一類架構很適合拿來思考：

- Hermes Agent Track 應該長什麼樣子
- Mac mini M4 作為 Hermes Agent Home Base 時，控制面板應該看到哪些層
- Manual OS 與 autonomous branch 的邊界如何區分

### What AVIN Should Borrow

- 將 `Gateway / Skills / Memory / Tools / Sessions` 視為不同 UI 區塊，而不是混成一個 chat app。
- 把 local control 與 security boundary 放進控制面板語意。

### What AVIN Should Not Do Now

- 不建議現在導入或安裝 OpenClaw。
- 不應因為它像 control plane 就直接把 AVIN 帶向 full agent runtime。
- 不要把 current repo 直接變成 self-hosted agent stack。

目前比較合理的是把它當成 Hermes Agent Track 的架構參考樣本。

---

## C. CrewAI / Agent Workflow Frameworks

### What It Suggests

CrewAI 的官方文件把 `Agents / Tasks / Flows / Memory / Tools / Knowledge` 說得很清楚。

對 AVIN 有幫助的點：

- Agents:
  agent 是角色，不只是 model。
- Tasks:
  task 是明確工作單位，可以被指派與完成。
- Flows:
  flow 負責 state、control、next step，而不是所有事情都交給 agent autonomy。
- Memory:
  memory 是工作延續性，不只是聊天歷史。
- Tools:
  tool 是能力接口。
- Knowledge sources:
  外部知識來源需要明確掛載與治理。

### What AVIN Should Borrow

- 把 OS Control Panel 想成 `Flow-first, Agent-inside`，而不是 `Chat-first, Everything-inside-chat`。
- 把 Trigger Map、Workflow Experiment Board、Next Action、Review Gate 做成明確節點。
- 用 `Task -> Flow -> Review` 的畫面語言，而不是純聊天紀錄。

### AVIN Mapping

CrewAI 這類框架對 AVIN 的價值，主要不在於導入框架本身，而在於幫 AVIN 把：

- Trigger Map
- Workflow Experiment Board
- Candidate Queue
- Human Review Gate

想成一組有狀態、有路徑的控制面板元素。

---

## D. Personal Knowledge OS / Logseq-style Knowledge Map

### What It Suggests

Logseq 類產品的啟發不是第二大腦品牌語言，而是：

- Markdown / local-first 思維
- 文件關聯
- graph / map
- daily use

對 AVIN 很重要的一點是：控制面板不應只顯示文件清單。

它還應該顯示：

- 文件與文件的關係
- signal 與 experiment 的關係
- review 與 decision 的關係
- open-source-vault 候選與實測狀態的關係

### What AVIN Should Borrow

- local-first / markdown-first mindset
- graph or map view as optional orientation layer
- daily-use operating surface
- 讓使用者看到關係而不是只有檔案

### What AVIN Should Not Copy

- 不要把控制面板變成純 PKM 工具。
- 不要把 graph 畫面做成主體而沒有 operational meaning。
- 不要只做漂亮的知識地圖，卻沒有 next action / review / status。

---

## E. MCP Registry / Code2MCP / Repo-to-Tool Pipeline

### What It Suggests

MCP Registry 與 Code2MCP 代表的是另一條重要路線：

- GitHub repo 可能被轉成 MCP service
- tool adoption 不能只看 README
- 需要 intake / security / namespace / review

MCP Registry 本身已經把 registry / publish / ownership verification / API docs 視為獨立問題。

Code2MCP 這類研究則更進一步顯示：repo-to-tool pipeline 可以被半自動甚至 agentic 化。

### What AVIN Should Borrow

- open-source-vault UI 需要有 MCP Potential Check
- candidate tool 需要有 intake review / security / sandbox / decision gate
- 不應把 repo discovery 和 tool adoption 混為一談

### Why It Matters

這一層非常適合轉成 AVIN 的：

- Candidate Queue
- MCP Potential Queue
- Security Review Gate
- Sandbox Recommendation
- Do Not Touch Yet 標記

### What AVIN Should Not Do

- 不要把任何熱門 GitHub repo 自動轉成 MCP。
- 不要讓控制面板暗示看到 repo 就能直接接到 OS。
- 不要在沒有治理層的情況下做 repo-to-tool automation。

---

## F. What AVIN Should Absorb

AVIN OS Control Panel 應該吸收的不是完整產品，而是成熟的控制語意。

建議吸收：

- mission control
- trigger map
- candidate queue
- review gate
- architecture map
- risk status
- next action
- human approval
- static-first dashboard

### Practical Meaning

對 AVIN 而言，控制面板更像是：

- 一個靜態優先的 operating surface
- 一個把 markdown documents、workflow state、review gate、risk 與 next action 串起來的入口

而不是一個會自動執行所有事情的 AI 後台。

---

## G. What AVIN Should Not Copy

不應做的方向：

- 不做 SaaS
- 不做多租戶
- 不做大型後台
- 不做 agent 自動執行器
- 不做自動發文
- 不做 full observability platform
- 不一開始接 API / MCP
- 不把 UI 做得像工程監控後台

### Design Warning

AVIN 的控制面板不應長得像：

- DevOps command center
- SOC dashboard
- enterprise admin backend

它應該更像：

- AI Workflow OS mission board
- research + review + next-action console
- human-controlled operating surface

---

## H. Proposed Reference-to-AVIN Mapping

| Reference Pattern | What It Solves | What AVIN Can Borrow | What AVIN Should Avoid | Possible UI Area |
| --- | --- | --- | --- | --- |
| GitHub Agents tab / Agents page | Agent task kickoff, session tracking, review loop | Next Actions, Agent Task Panel, Review Gate, Session Status | Platform-level complexity, PR-native assumptions | Mission Control / Next Actions |
| OpenClaw Gateway control plane | Local agent routing, skills, memory, tools, sessions | Hermes architecture map, local control boundary, skills-memory-tools separation | Direct adoption, runtime-first thinking, install pressure | Hermes Agent Track / Architecture Map |
| CrewAI flows and crews | Agents, tasks, flows, memory, tools, knowledge | Trigger Map, Workflow Experiment Board, Task-to-flow mapping | Framework coupling, orchestration complexity too early | Workflow Experiment Board |
| Logseq-style knowledge map | Markdown-first knowledge graph, local-first relation view | Document relation map, graph layer, daily operating context | Pure PKM UI, graph without actionability | Knowledge Map / Architecture Map |
| MCP Registry | Registry model, ownership, server discovery, publication workflow | MCP Potential Queue, intake gate, namespace and review awareness | Auto-connect mindset, registry complexity too early | open-source-vault / MCP Potential |
| Code2MCP / repo-to-tool pipeline | Repo-to-service transformation possibility | Candidate risk labeling, repo-to-tool review awareness | Automatic repo conversion, zero-review pipeline | Candidate Queue / Tool Intake |

---

## Recommended AVIN UI Direction

如果把以上參考濃縮成 AVIN 版本，控制面板第一階段比較適合長成：

1. Mission Control
2. Trigger Map
3. Candidate Queue
4. Review Gate
5. Architecture Map
6. Risk Status
7. Next Action

這個順序比起：

- Agent chat first
- Tool control first
- API integration first

更符合 AVIN 目前 Stage 2 的工作模式。

---

## Working Conclusion

AVIN OS Control Panel 的正確方向，不是做成一個會自動做事的大型 agent backend。

比較正確的方向是：

- static-first
- markdown-aware
- workflow-aware
- risk-aware
- review-gated
- human-controlled

換句話說，先把 AVIN 已經存在的 research / workflow / review / decision layer 變成可見的控制面板，再決定哪些部分值得在之後接 agent、tool 或 MCP。

---

## Public References

- GitHub Docs: [Use Copilot agents](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents)
- GitHub Docs: [About agent management](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/agent-management)
- OpenClaw GitHub: [openclaw/openclaw](https://github.com/openclaw/openclaw)
- OpenClaw docs index: [docs/index.md](https://github.com/openclaw/openclaw/blob/main/docs/index.md)
- CrewAI docs: [Introduction](https://docs.crewai.com/en/introduction)
- CrewAI docs: [Knowledge](https://docs.crewai.com/en/concepts/knowledge)
- CrewAI docs: [Memory](https://docs.crewai.com/concepts/memory)
- Logseq official blog: [Logseq raises $4.1M to Accelerate Growth of the New World Knowledge Graph](https://blog.logseq.com/logseq-raises-4-1m-to-accelerate-growth-of-the-new-world-knowledge-graph/)
- MCP Registry GitHub: [modelcontextprotocol/registry](https://github.com/modelcontextprotocol/registry)
- Official MCP Registry: [registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io/)
- Code2MCP paper: [arXiv 2509.05941](https://arxiv.org/abs/2509.05941)
