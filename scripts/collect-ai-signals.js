#!/usr/bin/env node

/**
 * Collect recent AI-related RSS signals and write them into a Notion inbox.
 * This first version stays free by using feed excerpts for the summary field.
 */

const fs = require("fs");
const path = require("path");

const NOTION_API_VERSION = "2022-06-28";
const USER_AGENT = "avin-ai-digital-footprint-lab/1.0";
const DEFAULT_STATUS_CANDIDATES = ["待消化", "Inbox", "Unreviewed"];
const DEFAULT_PRIORITY_CANDIDATES = ["中", "Medium", "Normal"];
const DEFAULT_CONVERTIBLE_CANDIDATES = ["待判斷", "未判斷", "Review Later"];
const PROPERTY_NAMES = {
  signalTitle: ["訊號標題", "Signal Title", "Name", "Title"],
  sourcePlatform: ["來源平台", "Source Platform", "Source"],
  originalLink: ["原始連結", "Original Link", "URL"],
  signalType: ["類型", "Signal Type", "Type"],
  aiSummary: ["AI 摘要", "AI Summary", "Summary"],
  avinNotes: ["AVIN 消化筆記", "AVIN Notes", "Notes"],
  contentConvertible: ["可轉內容", "Content Potential", "Convertible"],
  status: ["狀態", "Status"],
  priority: ["優先級", "Priority"],
  createdDate: ["建立日期", "Created Date", "Date"]
};

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function loadSourceConfig() {
  const configPath = path.join(process.cwd(), "config", "ai-signal-sources.json");
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function decodeXmlEntities(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(value) {
  return normalizeWhitespace(decodeXmlEntities(value).replace(/<[^>]+>/g, " "));
}

function buildRichTextItems(text) {
  if (!text) {
    return [];
  }

  const chunks = [];
  const maxLength = 2000;

  for (let index = 0; index < text.length; index += maxLength) {
    chunks.push({
      type: "text",
      text: {
        content: text.slice(index, index + maxLength)
      }
    });
  }

  return chunks;
}

function extractTagValue(block, tagName) {
  const pattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`, "i");
  const match = block.match(pattern);
  return match ? match[1].trim() : "";
}

function extractFirstTagValue(block, tagNames) {
  for (const tagName of tagNames) {
    const value = extractTagValue(block, tagName);
    if (value) {
      return value;
    }
  }
  return "";
}

function extractAtomLink(block) {
  const alternateLink =
    block.match(/<link[^>]+rel=["']alternate["'][^>]+href=["']([^"']+)["'][^>]*>/i) ||
    block.match(/<link[^>]+href=["']([^"']+)["'][^>]*\/?>/i);

  return alternateLink ? alternateLink[1].trim() : "";
}

function parseDate(value) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString();
}

function buildFreeSummary(item) {
  const cleanSummary = stripHtml(item.summary || "");
  const cleanTitle = stripHtml(item.title || "");
  const combined = cleanSummary || cleanTitle;

  if (!combined) {
    return "";
  }

  const sentences = combined
    .split(/(?<=[.!?。！？])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  let summary = sentences.slice(0, 2).join(" ");

  if (!summary) {
    summary = combined;
  }

  if (summary.length > 280) {
    return `${summary.slice(0, 277)}...`;
  }

  return summary;
}

function parseFeed(xml, source) {
  const isAtom = /<feed[\s>]/i.test(xml);
  const blockPattern = isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi;
  const blocks = xml.match(blockPattern) || [];

  return blocks
    .map((block) => {
      const title = stripHtml(extractFirstTagValue(block, ["title"]));
      const link = isAtom
        ? extractAtomLink(block)
        : stripHtml(extractFirstTagValue(block, ["link"]));
      const summary = extractFirstTagValue(block, [
        "description",
        "content:encoded",
        "summary",
        "content"
      ]);
      const publishedAt = parseDate(
        extractFirstTagValue(block, ["pubDate", "published", "updated", "dc:date"])
      );

      if (!title || !link) {
        return null;
      }

      return {
        sourceId: source.id,
        sourceName: source.name,
        sourcePlatform: source.platform,
        signalType: source.type,
        title,
        link,
        summary: stripHtml(summary),
        aiSummary: buildFreeSummary({ title, summary }),
        publishedAt
      };
    })
    .filter(Boolean);
}

async function fetchFeedItems(source) {
  const response = await fetch(source.url, {
    headers: {
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9",
      "User-Agent": USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(`Feed request failed with ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  return parseFeed(xml, source);
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

async function fetchNotionDatabase(notionToken, databaseId) {
  return notionRequest(`https://api.notion.com/v1/databases/${databaseId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${notionToken}`,
      "Notion-Version": NOTION_API_VERSION
    }
  });
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

  if (property.type === "date") {
    return property.date?.start?.trim() || "";
  }

  return "";
}

function findProperty(properties, candidates) {
  for (const name of candidates) {
    if (properties[name]) {
      return { name, value: properties[name] };
    }
  }
  return null;
}

function readProperty(properties, candidates) {
  return extractPlainTextFromProperty(findProperty(properties, candidates)?.value);
}

async function fetchAllNotionPages(notionToken, databaseId) {
  const pages = [];
  let nextCursor = undefined;

  while (true) {
    const body = { page_size: 100 };

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
          "Notion-Version": NOTION_API_VERSION
        },
        body: JSON.stringify(body)
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

function pickPropertySchema(database, candidates) {
  const properties = database.properties || {};

  for (const name of candidates) {
    if (properties[name]) {
      return { name, schema: properties[name] };
    }
  }

  return null;
}

function getTitlePropertySchema(database) {
  const properties = database.properties || {};

  for (const [name, schema] of Object.entries(properties)) {
    if (schema.type === "title") {
      return { name, schema };
    }
  }

  throw new Error("Notion database is missing a title property for signal creation.");
}

function findOptionName(schema, candidates) {
  const options = schema?.[schema.type]?.options || [];

  for (const candidate of candidates) {
    if (options.some((option) => option.name === candidate)) {
      return candidate;
    }
  }

  return "";
}

function setPropertyValue(propertyPayload, propertyEntry, value, warnings, options = {}) {
  if (!propertyEntry || value === undefined || value === null || value === "") {
    return;
  }

  const { name, schema } = propertyEntry;
  const type = schema.type;

  if (type === "title") {
    propertyPayload[name] = { title: buildRichTextItems(String(value)) };
    return;
  }

  if (type === "rich_text") {
    propertyPayload[name] = { rich_text: buildRichTextItems(String(value)) };
    return;
  }

  if (type === "url") {
    propertyPayload[name] = { url: String(value) };
    return;
  }

  if (type === "date") {
    propertyPayload[name] = { date: { start: String(value) } };
    return;
  }

  if (type === "checkbox") {
    propertyPayload[name] = { checkbox: Boolean(value) };
    return;
  }

  if (type === "status" || type === "select") {
    const optionName = findOptionName(schema, options.optionCandidates || [String(value)]);

    if (!optionName) {
      warnings.push(`No matching option found for property "${name}" in Notion.`);
      return;
    }

    propertyPayload[name] = {
      [type]: { name: optionName }
    };
    return;
  }

  warnings.push(`Unsupported Notion property type for "${name}": ${type}`);
}

function buildSignalProperties(database, signal) {
  const warnings = [];
  const propertyPayload = {};
  const titleProperty = getTitlePropertySchema(database);

  setPropertyValue(propertyPayload, titleProperty, signal.title, warnings);
  setPropertyValue(
    propertyPayload,
    pickPropertySchema(database, PROPERTY_NAMES.sourcePlatform),
    signal.sourcePlatform,
    warnings
  );
  setPropertyValue(
    propertyPayload,
    pickPropertySchema(database, PROPERTY_NAMES.originalLink),
    signal.link,
    warnings
  );
  setPropertyValue(
    propertyPayload,
    pickPropertySchema(database, PROPERTY_NAMES.signalType),
    signal.signalType,
    warnings
  );
  setPropertyValue(
    propertyPayload,
    pickPropertySchema(database, PROPERTY_NAMES.aiSummary),
    signal.aiSummary,
    warnings
  );
  setPropertyValue(
    propertyPayload,
    pickPropertySchema(database, PROPERTY_NAMES.avinNotes),
    "",
    warnings
  );
  setPropertyValue(
    propertyPayload,
    pickPropertySchema(database, PROPERTY_NAMES.contentConvertible),
    false,
    warnings,
    { optionCandidates: DEFAULT_CONVERTIBLE_CANDIDATES }
  );
  setPropertyValue(
    propertyPayload,
    pickPropertySchema(database, PROPERTY_NAMES.status),
    DEFAULT_STATUS_CANDIDATES[0],
    warnings,
    { optionCandidates: DEFAULT_STATUS_CANDIDATES }
  );
  setPropertyValue(
    propertyPayload,
    pickPropertySchema(database, PROPERTY_NAMES.priority),
    DEFAULT_PRIORITY_CANDIDATES[0],
    warnings,
    { optionCandidates: DEFAULT_PRIORITY_CANDIDATES }
  );
  setPropertyValue(
    propertyPayload,
    pickPropertySchema(database, PROPERTY_NAMES.createdDate),
    signal.publishedAt || new Date().toISOString(),
    warnings
  );

  return { propertyPayload, warnings };
}

async function createNotionPage(notionToken, databaseId, properties) {
  return notionRequest("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${notionToken}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_API_VERSION
    },
    body: JSON.stringify({
      parent: {
        database_id: databaseId
      },
      properties
    })
  });
}

function buildExistingSets(pages) {
  const linkSet = new Set();
  const titleSourceSet = new Set();

  for (const page of pages) {
    const properties = page.properties || {};
    const link = readProperty(properties, PROPERTY_NAMES.originalLink);
    const title = readProperty(properties, PROPERTY_NAMES.signalTitle);
    const source = readProperty(properties, PROPERTY_NAMES.sourcePlatform);

    if (link) {
      linkSet.add(link);
    }

    if (title && source) {
      titleSourceSet.add(`${title}::${source}`);
    }
  }

  return { linkSet, titleSourceSet };
}

function filterSignals(signals, existingSets, config) {
  const now = Date.now();
  const lookbackMs = (config.lookback_days || 7) * 24 * 60 * 60 * 1000;
  const dedupedSignals = [];
  const seenLinks = new Set(existingSets.linkSet);
  const seenTitleSources = new Set(existingSets.titleSourceSet);
  let skippedDuplicates = 0;
  let skippedStale = 0;

  const sortedSignals = signals.sort((left, right) => {
    return new Date(right.publishedAt || 0).getTime() - new Date(left.publishedAt || 0).getTime();
  });

  for (const signal of sortedSignals) {
    if (signal.publishedAt) {
      const publishedAt = new Date(signal.publishedAt).getTime();
      if (!Number.isNaN(publishedAt) && now - publishedAt > lookbackMs) {
        skippedStale += 1;
        continue;
      }
    }

    const titleSourceKey = `${signal.title}::${signal.sourcePlatform}`;

    if (seenLinks.has(signal.link) || seenTitleSources.has(titleSourceKey)) {
      skippedDuplicates += 1;
      continue;
    }

    dedupedSignals.push(signal);
    seenLinks.add(signal.link);
    seenTitleSources.add(titleSourceKey);

    if (dedupedSignals.length >= (config.daily_limit || 15)) {
      break;
    }
  }

  return { dedupedSignals, skippedDuplicates, skippedStale };
}

async function main() {
  try {
    const notionToken = getRequiredEnv("NOTION_TOKEN");
    const notionDatabaseId = getRequiredEnv("NOTION_AI_SIGNAL_DATABASE_ID");
    const config = loadSourceConfig();
    const enabledSources = (config.sources || []).filter((source) => source.enabled && source.url);

    console.log(`Loading Notion database schema for AI signal inbox...`);
    const database = await fetchNotionDatabase(notionToken, notionDatabaseId);

    console.log(`Loading existing Notion pages for dedupe...`);
    const existingPages = await fetchAllNotionPages(notionToken, notionDatabaseId);
    const existingSets = buildExistingSets(existingPages);

    const collectedSignals = [];
    let feedErrorCount = 0;

    for (const source of enabledSources) {
      try {
        console.log(`Fetching feed: ${source.name}`);
        const items = await fetchFeedItems(source);
        collectedSignals.push(...items);
      } catch (error) {
        feedErrorCount += 1;
        console.warn(`Warning: failed to fetch ${source.name}: ${error.message}`);
      }
    }

    const { dedupedSignals, skippedDuplicates, skippedStale } = filterSignals(
      collectedSignals,
      existingSets,
      config
    );

    let createdCount = 0;
    let createFailureCount = 0;

    for (const signal of dedupedSignals) {
      const { propertyPayload, warnings } = buildSignalProperties(database, signal);

      for (const warning of warnings) {
        console.warn(`Warning for signal "${signal.title}": ${warning}`);
      }

      try {
        await createNotionPage(notionToken, notionDatabaseId, propertyPayload);
        console.log(`Collected signal: ${signal.title}`);
        createdCount += 1;
      } catch (error) {
        console.warn(`Warning: failed to write signal "${signal.title}" to Notion: ${error.message}`);
        createFailureCount += 1;
      }
    }

    console.log(
      `Finished. collected=${createdCount} skipped_duplicates=${skippedDuplicates} skipped_stale=${skippedStale} feed_errors=${feedErrorCount} write_failures=${createFailureCount}`
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

main();
