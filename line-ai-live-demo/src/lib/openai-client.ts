import { clinicConfig } from "@/lib/clinic-config";
import { getRuntimeConfig } from "@/lib/live-demo-config";
import { reportOperationalError } from "@/lib/monitoring";

const OPENAI_RESPONSES_API_URL = "https://api.openai.com/v1/responses";

export type OpenAiReplyContext = {
  bookingBranch?: string;
  bookingTreatment?: string;
  lastIntent?: string;
  lastReferencedBranch?: string;
  lastReferencedTreatment?: string;
  locationPreference?: string;
  preferredBranch?: string;
};

type OpenAiResponsePayload = {
  output_text?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
};

export type GeneratedOpenAiReply = {
  model: string;
  text: string;
  tokensIn: number;
  tokensOut: number;
};

export function buildSystemPrompt() {
  const activeBranchNames = clinicConfig.branches.filter((branch) => branch.isActive).map((branch) => branch.name);
  const approvedTreatmentNames = clinicConfig.treatmentList.map((treatment) => treatment.name);

  return [
    `目前實際營運館別：${activeBranchNames.join("、")}。`,
    `目前已核准可說明療程：${approvedTreatmentNames.join("、")}。`,
    "以上未列出的館別或療程，一律回答目前沒有提供，並引導由真人客服確認；不要臆測。",
    `你是${clinicConfig.clinicName}的 LINE AI 客服。`,
    "你的目標是先接住客人、先回答低風險問題、先整理預約需求。",
    "你可以回答診所基本資訊、療程第一層介紹、預約資料收集與一般保守提醒。",
    "你不能做醫療診斷、保證療效、保證價格、替代醫師判斷。",
    "如果問題涉及個人適合度、術後異常、嚴重客訴或需要醫師判斷，請保守回答並引導由真人客服後續接手。",
    "回覆要簡短、自然、像真人客服，不要過度推銷，不要自己編造不存在的館別、療程、價格、醫師資訊。",
    "如果不知道，就明確說系統目前沒有這筆資料，並協助整理需求。",
  ].join("\n");
}

function buildContextLines(context?: OpenAiReplyContext) {
  if (!context) {
    return [];
  }

  const lines: string[] = [];
  if (context.locationPreference) {
    lines.push(`客人位置偏好：${context.locationPreference}`);
  }
  if (context.preferredBranch || context.lastReferencedBranch || context.bookingBranch) {
    lines.push(`目前提到的館別：${context.bookingBranch ?? context.preferredBranch ?? context.lastReferencedBranch}`);
  }
  if (context.bookingTreatment || context.lastReferencedTreatment) {
    lines.push(`目前提到的療程：${context.bookingTreatment ?? context.lastReferencedTreatment}`);
  }
  if (context.lastIntent) {
    lines.push(`上一個意圖：${context.lastIntent}`);
  }
  return lines;
}

function buildUserPrompt(message: string, context?: OpenAiReplyContext) {
  const contextLines = buildContextLines(context);

  return [
    "請直接用繁體中文回覆客人。",
    "如果能安全回答，就直接回答。",
    "如果不能安全回答，就先保守說明，再自然收斂到真人客服後續協助。",
    ...(contextLines.length > 0 ? ["", "對話背景：", ...contextLines] : []),
    "",
    `客人訊息：${message}`,
  ].join("\n");
}

function extractTextFromOpenAiResponse(payload: OpenAiResponsePayload) {
  const text = payload.output_text?.trim();
  return text || null;
}

export async function generateOpenAiReply(message: string, context?: OpenAiReplyContext): Promise<GeneratedOpenAiReply | null> {
  const config = getRuntimeConfig();
  if (config.aiProvider !== "openai" || !config.openAiApiKey) {
    return null;
  }

  try {
    const response = await fetch(OPENAI_RESPONSES_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openAiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: buildUserPrompt(message, context),
        instructions: buildSystemPrompt(),
        max_output_tokens: config.openAiMaxTokens,
        model: config.openAiModel,
      }),
    });

    const rawText = await response.text();
    if (!response.ok) {
      throw new Error(`OpenAI API error ${response.status}: ${rawText}`);
    }

    let payload: OpenAiResponsePayload;
    try {
      payload = JSON.parse(rawText) as OpenAiResponsePayload;
    } catch {
      throw new Error("OpenAI API returned invalid JSON");
    }

    const text = extractTextFromOpenAiResponse(payload);
    if (!text) {
      return null;
    }

    return {
      model: config.openAiModel,
      text,
      tokensIn: payload.usage?.input_tokens ?? 0,
      tokensOut: payload.usage?.output_tokens ?? 0,
    };
  } catch (error) {
    await reportOperationalError({
      error,
      extra: {
        openai_model: config.openAiModel,
      },
      source: "openai_api",
    });
    throw error;
  }
}
