import type { LineReplyMessage, LineTextMessage } from "@/lib/treatment-carousel";

function normalizeLine(line: string) {
  return line.replace(/[ \t]+/g, " ").trim();
}

function splitParagraphIntoLines(paragraph: string) {
  const normalized = normalizeLine(paragraph);
  if (!normalized) {
    return [];
  }

  const lines = normalized
    .split(/(?<=[。！？])/u)
    .map((part) => normalizeLine(part))
    .filter(Boolean);

  return lines.length > 0 ? lines : [normalized];
}

export function formatReplyText(text: string) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return "";
  }

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) =>
      paragraph
        .split("\n")
        .map((line) => normalizeLine(line))
        .filter(Boolean),
    )
    .filter((lines) => lines.length > 0);

  return paragraphs
    .map((lines) => {
      if (lines.length === 1) {
        return splitParagraphIntoLines(lines[0]).join("\n");
      }

      return lines
        .map((line) => splitParagraphIntoLines(line).join("\n"))
        .join("\n");
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export function formatReplyMessages(messages: LineReplyMessage[]) {
  return messages.map((message) => {
    if (message.type !== "text") {
      return message;
    }

    return {
      ...message,
      text: formatReplyText(message.text),
    } satisfies LineTextMessage;
  });
}
