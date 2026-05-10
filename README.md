# AVIN AI Digital Footprint Lab

AI Workflow Explorer | Building a public learning lab for AI tools, automation, and digital footprints.

## What This Repo Is

This is a public AI learning lab.

The goal is to document AI learning, AI workflows, prompt design, automation experiments, and digital footprint building in a form that can be published, searched, cited, and improved over time.

## Positioning

AI Workflow Explorer

Building a public learning lab for AI tools, automation, and digital footprints.

## Core Principle

Every AI learning moment should become a reusable asset.

## Why This Exists

Most AI learning disappears inside chats, tabs, and unfinished notes.

This repository turns that learning into reusable assets:

- learning notes become reference documents
- prompts become repeatable skills
- workflows become operating procedures
- experiments become case studies
- public outputs become long-term digital assets

## Repository Structure

```text
avin-ai-digital-footprint-lab/
├── README.md
├── 00-manifesto/
│   └── ai-workflow-explorer.md
├── 01-learning-notes/
│   └── README.md
├── 02-prompts-and-skills/
│   ├── ai-research-breakdown-skill.md
│   ├── multi-platform-content-skill.md
│   ├── credibility-review-skill.md
│   └── digital-asset-review-skill.md
├── 03-workflows/
│   ├── notion-to-linkedin.md
│   ├── notion-to-github.md
│   ├── learning-to-content.md
│   └── weekly-digital-footprint-review.md
├── 04-case-studies/
│   └── threads-engine-2-to-digital-footprint-3.md
├── 05-templates/
│   ├── learning-log-template.md
│   ├── linkedin-post-template.md
│   ├── github-doc-template.md
│   ├── portfolio-case-template.md
│   └── resume-bullet-template.md
├── config/
│   └── ai-signal-sources.json
├── scripts/
│   ├── notion-to-github-issues.js
│   ├── generate-docs-index.js
│   └── collect-ai-signals.js
├── .github/
│   └── workflows/
│       ├── notion-to-github-issues.yml
│       ├── generate-docs-index.yml
│       └── collect-ai-signals.yml
├── docs-index.md
├── .env.example
└── CHANGELOG.md
```

## Folder Guide

- `00-manifesto/`: public thesis and operating philosophy
- `01-learning-notes/`: structured notes from AI learning sessions
- `02-prompts-and-skills/`: reusable prompts and skill-like instructions
- `03-workflows/`: repeatable workflows for turning learning into public assets
- `04-case-studies/`: longer-form breakdowns of systems, experiments, and transitions
- `05-templates/`: starter templates for notes, posts, docs, and portfolio assets
- `config/`: source configuration for free automation jobs
- `scripts/`: free automation scripts powered by Node.js
- `.github/workflows/`: GitHub Actions workflows for scheduled and push-based automation

## How To Use

1. Capture what you learned in Notion or a raw note.
2. Distill it into a learning note, workflow, prompt, or case study.
3. Publish the strongest version as a GitHub document or social post.
4. Reuse the resulting asset in future learning and content.

## Current Status

- repository scaffold created
- manifesto, notes, workflows, skills, and templates added
- free `Notion -> GitHub Issue` automation added
- free Markdown docs index automation added
- setup still requires your real Notion database, GitHub repository, and secrets
- the workflows assume this folder is used as the root of the final GitHub repository

## Key Documents

- [User Guide](./USER_GUIDE.md)
- [Docs Index](./docs-index.md)
- [Stage 1 Project Log](./00-project-log/2026-05-10-ai-digital-footprint-os-stage-1.md)
- [System Overview](./01-system-overview/avin-ai-digital-footprint-os-2.0-overview.md)
- [Prompt and Skill Library](./02-prompts-and-skills/README.md)
- [AI Workflow Explorer Positioning](./03-positioning/avin-ai-workflow-explorer-positioning.md)
- [GitHub Profile README Draft](./06-platform-outputs/github-profile-readme-draft.md)
- [LinkedIn Profile Update Draft](./06-platform-outputs/linkedin-profile-update-draft.md)
- [Personal Website Hero Draft](./06-platform-outputs/personal-website-hero-draft.md)
- [Featured Case Study](./04-case-studies/threads-engine-2-to-digital-footprint-3.md)

## Automation Included

### 1. Notion -> GitHub Issue

Purpose:
Read the Notion database named `AI 數位足跡同步中心`, find rows where:

- `GitHub 狀態 = 需更新`
- `更新優先級 = 高`

Then create a GitHub Issue with the title format:

```text
[Docs] {{主題名稱}}
```

The generated issue body includes:

- Notion source link
- topic name
- content type
- Chinese summary
- English summary
- hidden asset
- next step
- suggested doc path
- acceptance criteria

Duplicate protection:

- skip when the same issue title already exists
- skip when an existing issue body already contains the same Notion page id
- skip when the Notion row already has a non-empty `GitHub 連結` field

### 2. Docs Index Generator

Purpose:
On every push to `main`, scan all Markdown files, read their first H1 title, and regenerate `docs-index.md`.

If the file changes, GitHub Actions commits the updated index automatically.

### 3. AI Signal Radar

Purpose:
Collect daily AI signals from configured RSS feeds and write them into the Notion database `AI 靈感雷達｜Daily Signal Inbox`.

Scope:

- collect and dedupe RSS items
- write title, source, link, type, summary, and date into Notion
- stay free by using source excerpts as the first-pass summary field
- keep final opinion and publishing decisions manual

Default behavior:

- runs once per day
- reads source URLs from `config/ai-signal-sources.json`
- writes at most 15 signals per run by default
- skips items when the same original link already exists in Notion
- skips items when the title and source platform already exist together

## Setup

### Create a Notion Integration

1. Go to the Notion integrations page and create a new internal integration.
2. Copy the integration token.
3. Share the `AI 數位足跡同步中心` database with that integration.
4. Confirm the integration has permission to read the database.

### Get the Notion Database ID

1. Open the target Notion database in the browser.
2. Copy the URL.
3. The database id is the 32-character identifier in the URL.
4. Use that value for `NOTION_DATABASE_ID`.

### Configure GitHub Secrets

Set the following repository secrets in GitHub:

- `NOTION_TOKEN`
- `NOTION_DATABASE_ID`
- `NOTION_AI_SIGNAL_DATABASE_ID`

You do not need to manually create `GITHUB_TOKEN` for GitHub Actions. The built-in `secrets.GITHUB_TOKEN` is used by default.

### Configure Repository Variables

Set this repository variable in GitHub Actions if you want an explicit value:

- `GITHUB_REPOSITORY`

If omitted in GitHub Actions, the workflow uses `${{ github.repository }}` automatically.

## Local Environment Example

The included [.env.example](./.env.example) shows the expected variables:

```text
NOTION_TOKEN=
NOTION_DATABASE_ID=
NOTION_AI_SIGNAL_DATABASE_ID=
GITHUB_REPOSITORY=
GITHUB_TOKEN=
```

For local manual testing, export the variables in your shell before running the scripts.

PowerShell example:

```powershell
$env:NOTION_TOKEN="your_notion_token"
$env:NOTION_DATABASE_ID="your_database_id"
$env:NOTION_AI_SIGNAL_DATABASE_ID="your_ai_signal_database_id"
$env:GITHUB_REPOSITORY="owner/repo"
$env:GITHUB_TOKEN="your_personal_access_token"
node scripts/notion-to-github-issues.js
node scripts/generate-docs-index.js
node scripts/collect-ai-signals.js
```

## Manual Testing

### Test the Notion -> GitHub Issue Workflow

1. Create or edit one Notion row so that:
   `GitHub 狀態 = 需更新`
   `更新優先級 = 高`
2. Make sure `GitHub 連結` is empty.
3. Run the GitHub Action manually from the `Actions` tab using `workflow_dispatch`.
4. Check the repository `Issues` tab for a new `[Docs] ...` issue.

### Test the Docs Index Workflow

1. Edit or add a Markdown file with a valid H1 heading.
2. Push to `main`.
3. Open the `generate-docs-index` workflow run.
4. Confirm that `docs-index.md` was updated and committed when needed.

### Test the AI Signal Radar Workflow

1. Create a Notion database named `AI 靈感雷達｜Daily Signal Inbox`.
2. Add these suggested properties:
   `訊號標題`, `來源平台`, `原始連結`, `類型`, `AI 摘要`, `AVIN 消化筆記`, `可轉內容`, `狀態`, `優先級`, `建立日期`
3. Add `NOTION_AI_SIGNAL_DATABASE_ID` as a GitHub Actions secret.
4. Run `collect-ai-signals` manually from the `Actions` tab using `workflow_dispatch`.
5. Confirm that new rows appear in Notion and that duplicate links are skipped on repeated runs.

## How To Confirm It Worked

- the `notion-to-github-issues` workflow run finishes successfully
- a new GitHub Issue appears with the expected `[Docs]` title
- the issue body contains the Notion link and the hidden Notion page id marker
- `docs-index.md` lists the expected Markdown files and titles
- the `collect-ai-signals` workflow run reports collected and skipped counts
- the AI signal inbox in Notion receives new rows without duplicating the same original link

## Troubleshooting

### No issue was created

Check:

- `NOTION_TOKEN` is valid
- `NOTION_DATABASE_ID` is correct
- the Notion database is shared with the integration
- the row really matches `GitHub 狀態 = 需更新` and `更新優先級 = 高`
- `GitHub 連結` is empty
- an issue with the same title does not already exist

### Workflow says Notion access failed

Check:

- the integration token is correct
- the database is shared with the integration
- the database id points to the correct database

### Workflow says GitHub access failed

Check:

- workflow permissions include `issues: write`
- the workflow is running in the target repository
- local tests use a valid personal access token when not using GitHub Actions

### docs-index.md did not change

Check:

- the Markdown files contain a first-level heading such as `# Title`
- the changed files are actually inside the repository
- the generated output is different from the committed version

### AI signal radar did not write to Notion

Check:

- `NOTION_AI_SIGNAL_DATABASE_ID` is correct
- the AI signal inbox database is shared with the integration
- the database contains a title property that can hold `訊號標題`
- the configured RSS feed URLs still respond with valid XML
- duplicate detection did not already skip the item because the same link or title plus source already exists

## Roadmap

- add the first real AI learning notes
- convert one real workflow into a portfolio-grade case study
- add examples for each prompt skill
- add issue templates for new notes and new workflows
- connect published GitHub docs back to LinkedIn or other public channels
- refine the Notion schema after real weekly usage
- upgrade AI signal summaries from feed excerpts to a local or low-cost model only when the free workflow proves useful
