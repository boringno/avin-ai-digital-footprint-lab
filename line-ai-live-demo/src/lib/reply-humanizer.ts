import { clinicConfig } from "@/lib/clinic-config";
import { getRuntimeConfig } from "@/lib/live-demo-config";

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

type ClaudeTextBlock = {
  text?: string;
  type?: string;
};

type ClaudeMessageResponse = {
  content?: ClaudeTextBlock[];
};

type HumanizeReplyInput = {
  baseReplyText: string;
  decisionType: string;
  matchedKey: string;
  matchedType: string;
  messageText: string;
};

function buildHumanizerPrompt(input: HumanizeReplyInput) {
  return [
    `你是台灣醫美診所 LINE AI 客服『${clinicConfig.aiName}』。`,
    "你的任務不是重新判斷規則，而是把既有回覆改寫得更像真人客服，語氣自然、禮貌、俐落。",
    "你只能改寫，不可新增未提供的事實，不可自行補價格、活動日期、醫師班表、療程適應症或懷孕風險判斷。",
    "如果原始回覆是在引導轉真人或後續確認，你可以自然地補一句請對方留下姓名、電話、方便館別或想預約時段，方便後續協助。",
    "請用繁體中文，2 到 4 句，像真人客服，不要條列，不要署名，因為系統會另外加上 AI 身分提示。",
    "",
    `客人訊息：${input.messageText}`,
    `決策類型：${input.decisionType}`,
    `匹配類型：${input.matchedType}`,
    `匹配鍵值：${input.matchedKey}`,
    `原始回覆：${input.baseReplyText}`,
    "",
    "請輸出改寫後回覆：",
  ].join("\n");
}

function extractText(payload: ClaudeMessageResponse) {
  return (payload.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

export async function maybeHumanizeReply(input: HumanizeReplyInput) {
  const config = getRuntimeConfig();
  if (!config.claudeHumanizerEnabled || !config.anthropicApiKey || !input.baseReplyText.trim()) {
    return null;
  }

  const response = await fetch(CLAUDE_API_URL, {
    method: "POST",
    headers: {
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
      "x-api-key": config.anthropicApiKey,
    },
    body: JSON.stringify({
      max_tokens: Math.min(config.anthropicMaxTokens, 220),
      messages: [
        {
          content: buildHumanizerPrompt(input),
          role: "user",
        },
      ],
      model: config.anthropicModel,
      system: "你只負責安全改寫既有客服文案，不可新增醫療或商業事實。",
      temperature: 0.35,
    }),
  });

  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`Claude humanizer error ${response.status}: ${rawText}`);
  }

  let payload: ClaudeMessageResponse;
  try {
    payload = JSON.parse(rawText) as ClaudeMessageResponse;
  } catch {
    throw new Error("Claude humanizer returned invalid JSON");
  }

  const text = extractText(payload);
  return text || null;
}
