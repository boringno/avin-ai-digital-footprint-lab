export type OpenAiResponsesPayload = {
  output?: Array<{
    content?: Array<{
      annotations?: Array<{
        type?: unknown;
        title?: unknown;
        url?: unknown;
        url_citation?: { title?: unknown; url?: unknown };
      }>;
      text?: unknown;
      type?: unknown;
    }>;
    type?: unknown;
  }>;
  output_text?: unknown;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
};

export function extractOpenAiResponseSourceUrls(payload: unknown) {
  if (!payload || typeof payload !== "object") return [];
  const response = payload as OpenAiResponsesPayload;
  return Array.from(new Set(
    (response.output ?? [])
      .flatMap((item) => Array.isArray(item.content) ? item.content : [])
      .flatMap((content) => Array.isArray(content.annotations) ? content.annotations : [])
      .filter((annotation) => annotation.type === "url_citation")
      .map((annotation) => annotation.url ?? annotation.url_citation?.url)
      .filter((url): url is string => typeof url === "string" && url.startsWith("https://")),
  ));
}

export function extractOpenAiResponseText(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const response = payload as OpenAiResponsesPayload;

  // output_text is an SDK convenience field. Keep accepting it for fixtures and
  // SDK-normalized payloads, but raw REST responses expose text in output[].content[].
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const text = (response.output ?? [])
    .flatMap((item) => item.type === "message" && Array.isArray(item.content) ? item.content : [])
    .filter((content) => content.type === "output_text" && typeof content.text === "string")
    .map((content) => (content.text as string).trim())
    .filter(Boolean)
    .join("\n")
    .trim();

  return text || null;
}
