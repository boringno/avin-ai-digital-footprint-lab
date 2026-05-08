#!/usr/bin/env node

/**
 * Read a Notion database, find high-priority rows that need GitHub updates,
 * and create GitHub Issues without using paid automation services.
 */

const NOTION_API_VERSION = "2022-06-28";
const DEFAULT_NOTION_STATUS = "需更新";
const DEFAULT_PRIORITY = "高";
const PROPERTY_NAMES = {
  topic: ["主題名稱", "Name", "Topic"],
  githubStatus: ["GitHub 狀態", "GitHub Status"],
  priority: ["更新優先級", "Priority"],
  githubLink: ["GitHub 連結", "GitHub Link"],
  contentType: ["內容類型", "Content Type"],
  zhSummary: ["中文版摘要", "中文摘要"],
  enSummary: ["英文版摘要", "English Summary"],
  hiddenAsset: ["隱形資產", "Hidden Asset"],
  nextStep: ["下一步", "Next Step"],
  suggestedPath: ["建議文件路徑", "Suggested Path"],
  acceptance: ["驗收標準", "Acceptance Criteria"],
};

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseRepository(repository) {
  const parts = repository.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      "GITHUB_REPOSITORY must look like 'owner/repo'. Example: avin/avin-ai-digital-footprint-lab"
    );
  }

  return { owner: parts[0], repo: parts[1] };
}

function extractPlainTextFromProperty(property) {
  if (!property) {
    return "";
  }

  if (property.type === "title" && Array.isArray(property.title)) {
    return property.title.map((item) => item.plain_text || "").join("").trim();
  }

  if (property.type === "rich_text" && Array.isArray(property.rich_text)) {
    return property.rich_text.map((item) => item.plain_text || "").join("").trim();
  }

  if (property.type === "select") {
    return property.select?.name?.trim() || "";
  }

  if (property.type === "status") {
    return property.status?.name?.trim() || "";
  }

  if (property.type === "url") {
    return property.url?.trim() || "";
  }

  if (property.type === "number") {
    return property.number === null ? "" : String(property.number);
  }

  if (property.type === "checkbox") {
    return property.checkbox ? "true" : "false";
  }

  if (property.type === "multi_select" && Array.isArray(property.multi_select)) {
    return property.multi_select.map((item) => item.name).join(", ").trim();
  }

  if (property.type === "people" && Array.isArray(property.people)) {
    return property.people.map((item) => item.name || item.id).join(", ").trim();
  }

  return "";
}

function findProperty(properties, candidates) {
  for (const name of candidates) {
    if (properties[name]) {
      return properties[name];
    }
  }
  return null;
}

function readProperty(properties, candidates) {
  return extractPlainTextFromProperty(findProperty(properties, candidates));
}

async function notionRequest(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload.message || `${response.status} ${response.statusText}`;
    throw new Error(`Notion API request failed: ${message}`);
  }

  return payload;
}

async function githubRequest(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload.message || `${response.status} ${response.statusText}`;
    throw new Error(`GitHub API request failed: ${message}`);
  }

  return payload;
}

async function fetchAllNotionPages(notionToken, databaseId) {
  const pages = [];
  let nextCursor = undefined;

  while (true) {
    const body = {
      page_size: 100,
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
    };

    if (nextCursor) {
      body.start_cursor = nextCursor;
    }

    const payload = await notionRequest(
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${notionToken}`,
          "Content-Type": "application/json",
          "Notion-Version": NOTION_API_VERSION,
        },
        body: JSON.stringify(body),
      }
    );

    pages.push(...payload.results);

    if (!payload.has_more || !payload.next_cursor) {
      break;
    }

    nextCursor = payload.next_cursor;
  }

  return pages;
}

async function fetchAllIssues(githubToken, owner, repo) {
  const issues = [];
  let page = 1;

  while (true) {
    const payload = await githubRequest(
      `https://api.github.com/repos/${owner}/${repo}/issues?state=all&per_page=100&page=${page}`,
      {
        method: "GET",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${githubToken}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );

    issues.push(...payload.filter((item) => !item.pull_request));

    if (payload.length < 100) {
      break;
    }

    page += 1;
  }

  return issues;
}

function buildIssueBody(page, fields) {
  const notionPageIdMarker = `<!-- notion-page-id: ${page.id} -->`;

  return [
    notionPageIdMarker,
    "",
    "## Notion Source",
    page.url || "Not available",
    "",
    "## Topic Name",
    fields.topic || "Untitled",
    "",
    "## Content Type",
    fields.contentType || "Not provided",
    "",
    "## Chinese Summary",
    fields.zhSummary || "Not provided",
    "",
    "## English Summary",
    fields.enSummary || "Not provided",
    "",
    "## Hidden Asset",
    fields.hiddenAsset || "Not provided",
    "",
    "## Next Step",
    fields.nextStep || "Not provided",
    "",
    "## Suggested Doc Path",
    fields.suggestedPath ? `\`${fields.suggestedPath}\`` : "Not provided",
    "",
    "## Acceptance Criteria",
    fields.acceptance || "Not provided",
  ].join("\n");
}

async function createIssue(githubToken, owner, repo, title, body) {
  return githubRequest(`https://api.github.com/repos/${owner}/${repo}/issues`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubToken}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ title, body }),
  });
}

async function main() {
  try {
    const notionToken = getRequiredEnv("NOTION_TOKEN");
    const notionDatabaseId = getRequiredEnv("NOTION_DATABASE_ID");
    const githubRepository = getRequiredEnv("GITHUB_REPOSITORY");
    const githubToken = getRequiredEnv("GITHUB_TOKEN");
    const { owner, repo } = parseRepository(githubRepository);

    console.log("Fetching Notion pages...");
    const pages = await fetchAllNotionPages(notionToken, notionDatabaseId);

    console.log("Fetching existing GitHub issues...");
    const issues = await fetchAllIssues(githubToken, owner, repo);

    let createdCount = 0;
    let skippedCount = 0;

    for (const page of pages) {
      if (page.archived || page.in_trash) {
        skippedCount += 1;
        continue;
      }

      const properties = page.properties || {};
      const fields = {
        topic: readProperty(properties, PROPERTY_NAMES.topic),
        githubStatus: readProperty(properties, PROPERTY_NAMES.githubStatus),
        priority: readProperty(properties, PROPERTY_NAMES.priority),
        githubLink: readProperty(properties, PROPERTY_NAMES.githubLink),
        contentType: readProperty(properties, PROPERTY_NAMES.contentType),
        zhSummary: readProperty(properties, PROPERTY_NAMES.zhSummary),
        enSummary: readProperty(properties, PROPERTY_NAMES.enSummary),
        hiddenAsset: readProperty(properties, PROPERTY_NAMES.hiddenAsset),
        nextStep: readProperty(properties, PROPERTY_NAMES.nextStep),
        suggestedPath: readProperty(properties, PROPERTY_NAMES.suggestedPath),
        acceptance: readProperty(properties, PROPERTY_NAMES.acceptance),
      };

      const shouldCreateIssue =
        fields.githubStatus === DEFAULT_NOTION_STATUS && fields.priority === DEFAULT_PRIORITY;

      if (!shouldCreateIssue) {
        skippedCount += 1;
        continue;
      }

      if (fields.githubLink) {
        console.log(`Skipping "${fields.topic || page.id}" because GitHub link already exists.`);
        skippedCount += 1;
        continue;
      }

      const issueTitle = `[Docs] ${fields.topic || "Untitled"}`;
      const notionPageIdMarker = `<!-- notion-page-id: ${page.id} -->`;
      const issueExists = issues.some(
        (issue) => issue.title === issueTitle || (issue.body || "").includes(notionPageIdMarker)
      );

      if (issueExists) {
        console.log(`Skipping "${issueTitle}" because a matching issue already exists.`);
        skippedCount += 1;
        continue;
      }

      const issueBody = buildIssueBody(page, fields);
      const created = await createIssue(githubToken, owner, repo, issueTitle, issueBody);

      console.log(`Created issue #${created.number}: ${created.html_url}`);
      issues.push(created);
      createdCount += 1;
    }

    console.log(
      `Finished. Created ${createdCount} issue(s). Skipped ${skippedCount} page(s).`
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

main();
