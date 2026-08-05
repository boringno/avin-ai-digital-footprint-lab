"use client";

import { useMemo, useState } from "react";

import styles from "./knowledge.module.css";

export type KnowledgeMapEntry = {
  details: string;
  prompts: string[];
  section: string;
  source: string;
  status: string;
  title: string;
};

type KnowledgeMapClientProps = {
  entries: KnowledgeMapEntry[];
};

export function KnowledgeMapClient({ entries }: KnowledgeMapClientProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-TW");
  const filteredEntries = useMemo(() => {
    if (!normalizedQuery) return entries;

    return entries.filter((entry) =>
      [entry.title, entry.section, entry.details, entry.source, entry.status, ...entry.prompts]
        .join(" ")
        .toLocaleLowerCase("zh-TW")
        .includes(normalizedQuery),
    );
  }, [entries, normalizedQuery]);
  const groupedEntries = useMemo(() => {
    return filteredEntries.reduce<Map<string, KnowledgeMapEntry[]>>((groups, entry) => {
      const existing = groups.get(entry.section) ?? [];
      existing.push(entry);
      groups.set(entry.section, existing);
      return groups;
    }, new Map());
  }, [filteredEntries]);

  return (
    <section className={styles.map} aria-label="AI 知識地圖">
      <label className={styles.searchLabel}>
        搜尋目前 AI 使用的資料
        <input
          className={styles.searchInput}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="例如：ONDA、雙下巴、16,888、懷孕、活動"
          type="search"
          value={query}
        />
      </label>
      <p className={styles.resultSummary}>顯示 {filteredEntries.length} / {entries.length} 筆資料</p>

      {groupedEntries.size === 0 ? <p className={styles.empty}>找不到符合的資料；可改用療程、客人問題、價格或來源檔案搜尋。</p> : null}

      {Array.from(groupedEntries.entries()).map(([section, sectionEntries]) => (
        <section className={styles.section} key={section}>
          <h2>{section}</h2>
          <div className={styles.grid}>
            {sectionEntries.map((entry) => (
              <article className={styles.card} key={`${entry.section}:${entry.title}:${entry.source}`}>
                <div className={styles.cardHeading}>
                  <h3>{entry.title}</h3>
                  <span className={styles.status}>{entry.status}</span>
                </div>
                {entry.prompts.length > 0 ? <p className={styles.prompts}>客人可能會問：{entry.prompts.join("／")}</p> : null}
                <p className={styles.details}>{entry.details}</p>
                <p className={styles.source}>來源：<code>{entry.source}</code></p>
              </article>
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}
