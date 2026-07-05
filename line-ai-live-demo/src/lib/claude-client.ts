import { getRuntimeConfig } from "@/lib/live-demo-config";

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_AI_REPLY =
  "我先為您整理基本方向；若您願意，也可以直接告訴我想了解的療程、方便的館別，以及 3 個方便時段，我先幫您整理預約方向。";

type ClaudeTextBlock = {
  text?: string;
  type?: string;
};

type ClaudeMessageResponse = {
  content?: ClaudeTextBlock[];
};

type ClaudeReplyContext = {
  bookingBranch?: string;
  bookingTreatment?: string;
  lastIntent?: string;
  lastReferencedBranch?: string;
  lastReferencedTreatment?: string;
  locationPreference?: string;
  preferredBranch?: string;
};

let claudeReplyInvocationCount = 0;

function buildSystemPrompt() {
  return [
    "你是順風診所的 LINE 夜間 AI 客服。",
    "你只能協助一般安全訊息的自然回覆，不負責自由生成療程介紹。",
    "若訊息涉及療程介紹、個人適合度、術後異常、療效保證或價格承諾，你不能自行延伸回答，也不能補出白名單外的醫療描述。",
    "你的核心目標不是把問題丟給真人客服，而是先接住客人、先回答低風險問題、先整理需求，再把需要人工判斷的部分留給客服上班後接續。",
    "回答時要像真人客服，口吻自然、簡短、清楚，不要過度制式。",
    "已知真人客服服務時間為週一至週五 09:00-18:00；若超過服務時間，也要先整理需求，不要讓客人覺得沒人處理。",
    "客人問什麼，就優先回答那個療程或那個項目本身，不要主動把話題帶去其他主打療程，也不要讓人感覺院內只有某幾個項目做得比較好。",
    "如果客人是在問療程、效果、適合對象、品牌、機型、術前術後、恢復期、是否值得做，先回答重點，再順勢引導下一步。",
    "如果適合往預約收斂，優先引導客人提供想做的療程、方便的館別，以及 3 個方便時段，方便後續安排。",
    "如果在整理預約需求，可自然收集療程、館別、3 個方便時段、是否初診、稱呼與聯絡電話。",
    "如果客人已經說了想去的館別，就不要再重複列出一整串館別名單。",
    "只有在客人明確詢問有哪些館別時，才列出目前系統內已建立的館別；不要自行編出未建立的館別。",
    "不要自行補出系統內未建立的品牌、機型、探頭或療程名稱；若系統沒有明確資料，要直接說目前系統尚未建立完整資料。",
    "禁止回答四類高風險內容：個人適合度、術後異常、療效保證、價格承諾。",
    "像眼周電波、品牌、機型這類問題，若已有院內既定資料，必須優先依院內資料回答，不可改用外部通用答案。",
    "如果客人已明顯想預約、問時間、問諮詢安排，就直接往蒐集預約資訊前進，不要只停留在知識回答。",
    "如果客人這一句很短、像是接續追問，例如「多少錢」「痛嗎」「多久」「哪一間」「地址」「可以做嗎」，請優先結合已知上下文理解，不要把它當成全新的陌生問題。",
    "如果客人提到懷孕、備孕、哺乳、禁忌症、風險、是否適合做，先給保守且實用的第一層建議，但不要做醫療診斷，最後提醒仍建議由醫師現場評估。",
    "價格不要自行編造，也不要把一般報價講死；除非系統已明確提供活動價或體驗價，否則以真人客服確認為主。",
    "如果客人問到院內未提供或系統尚未建立完整資料的療程，不要硬說有，也不要硬帶去其他療程；應清楚說明目前系統資料有限，並先幫客人整理需求。",
    "盡量控制在 2 到 4 句內，不要使用 markdown、不要條列、不要加標題。",
    "不要自行加上 AI 署名，系統會在最後補上。",
  ].join("\n");
}

function buildContextLines(context?: ClaudeReplyContext) {
  if (!context) {
    return [];
  }

  const lines: string[] = [];

  if (context.locationPreference) {
    lines.push(`客人偏好地區：${context.locationPreference}`);
  }
  if (context.preferredBranch || context.lastReferencedBranch || context.bookingBranch) {
    lines.push(`目前較相關館別：${context.bookingBranch ?? context.preferredBranch ?? context.lastReferencedBranch}`);
  }
  if (context.bookingTreatment || context.lastReferencedTreatment) {
    lines.push(`目前較相關療程：${context.bookingTreatment ?? context.lastReferencedTreatment}`);
  }
  if (context.lastIntent) {
    lines.push(`上一個已知意圖：${context.lastIntent}`);
  }

  return lines;
}

function buildUserPrompt(message: string, context?: ClaudeReplyContext) {
  const contextLines = buildContextLines(context);

  return [
    "請直接回覆這位 LINE 客人的訊息。",
    "如果適合，請在回答後自然收斂到預約下一步。",
    "可收斂的重點是：療程、館別、3 個方便時段。",
    ...(contextLines.length > 0 ? ["", "已知對話上下文：", ...contextLines] : []),
    "",
    `客人訊息：${message}`,
  ].join("\n");
}

function extractTextFromClaudeResponse(payload: ClaudeMessageResponse) {
  const text = (payload.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();

  return text || DEFAULT_AI_REPLY;
}

export async function generateClaudeReply(message: string, context?: ClaudeReplyContext) {
  claudeReplyInvocationCount += 1;
  const config = getRuntimeConfig();
  if (!config.claudeApiEnabled || !config.anthropicApiKey) {
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
      max_tokens: config.anthropicMaxTokens,
      messages: [
        {
          content: buildUserPrompt(message, context),
          role: "user",
        },
      ],
      model: config.anthropicModel,
      system: buildSystemPrompt(),
      temperature: 0.2,
    }),
  });

  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`Claude API error ${response.status}: ${rawText}`);
  }

  let payload: ClaudeMessageResponse;
  try {
    payload = JSON.parse(rawText) as ClaudeMessageResponse;
  } catch {
    throw new Error("Claude API returned invalid JSON");
  }

  return extractTextFromClaudeResponse(payload);
}

export function getClaudeReplyInvocationCount() {
  return claudeReplyInvocationCount;
}

export function resetClaudeReplyInvocationCount() {
  claudeReplyInvocationCount = 0;
}
