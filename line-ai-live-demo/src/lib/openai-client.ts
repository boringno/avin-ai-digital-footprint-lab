import {
  buildCustomerServiceSystemPrompt,
  buildCustomerServiceUserPrompt,
  type AiCustomerReplyContext,
} from "@/lib/ai-customer-policy";
import { findTreatmentByKey } from "@/lib/clinic-config";
import { getRuntimeConfig } from "@/lib/live-demo-config";
import { reportOperationalError } from "@/lib/monitoring";
import { extractOpenAiResponseSourceUrls, extractOpenAiResponseText, type OpenAiResponsesPayload } from "@/lib/openai-responses";

const OPENAI_RESPONSES_API_URL = "https://api.openai.com/v1/responses";

export type OpenAiReplyContext = AiCustomerReplyContext;

export type GeneratedOpenAiReply = {
  model: string;
  text: string;
  tokensIn: number;
  tokensOut: number;
  sourceUrl?: string;
};

function isAllowedOfficialSource(url: string, allowedDomains: string[]) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return allowedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

export function buildSystemPrompt() {
  return buildCustomerServiceSystemPrompt();
}

export function buildOpenAiUserPrompt(message: string, context?: OpenAiReplyContext) {
  return buildCustomerServiceUserPrompt(message, context);
}

export async function generateOpenAiReply(message: string, context?: OpenAiReplyContext): Promise<GeneratedOpenAiReply | null> {
  const config = getRuntimeConfig();
  if (config.aiProvider !== "openai" || !config.openAiApiKey) {
    return null;
  }

  const officialTreatment = context?.officialEducationTreatmentKey
    ? findTreatmentByKey(context.officialEducationTreatmentKey)
    : null;
  const officialSourceDomains = officialTreatment?.officialSourceDomains ?? [];
  if (context?.officialEducationTreatmentKey && officialSourceDomains.length === 0) {
    return null;
  }
  const usesOfficialSearch = officialSourceDomains.length > 0;
  const abortController = new AbortController();
  const timeoutMs = usesOfficialSearch ? config.aiOfficialSearchTimeoutMs : config.aiReplyGenerationTimeoutMs;
  const timeout = setTimeout(() => abortController.abort(new Error("OpenAI reply generation timed out")), timeoutMs);
  try {
    const request = async (body: Record<string, unknown>) => {
      const response = await fetch(OPENAI_RESPONSES_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.openAiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: abortController.signal,
      });
      const rawText = await response.text();
      if (!response.ok) {
        throw new Error(`OpenAI API error ${response.status}: ${rawText}`);
      }
      try {
        return JSON.parse(rawText) as OpenAiResponsesPayload;
      } catch {
        throw new Error("OpenAI API returned invalid JSON");
      }
    };

    let sourceUrl: string | undefined;
    let approvedKnowledge = context?.approvedKnowledge;
    let tokensIn = 0;
    let tokensOut = 0;

    if (usesOfficialSearch) {
      const searchPayload = await request({
        include: ["web_search_call.action.sources"],
        input: [
          `療程：${officialTreatment?.name ?? context?.officialEducationTreatmentKey}`,
          `客人問題：${message}`,
          "請只整理可供客服內部使用的一般原理、常見改善方向或一般注意事項。不要提供價格、活動、院內供應宣稱或療效保證。",
        ].join("\n"),
        instructions: "你是內部官方資料查證工具。只依允許的官方網域整理精簡事實筆記；這份內容不會直接顯示給客人。",
        max_output_tokens: config.openAiMaxTokens,
        model: config.openAiModel,
        reasoning: { effort: "none" },
        tool_choice: "required",
        tools: [{
          filters: { allowed_domains: officialSourceDomains },
          search_context_size: "low",
          type: "web_search",
        }],
      });
      approvedKnowledge = extractOpenAiResponseText(searchPayload) ?? undefined;
      sourceUrl = extractOpenAiResponseSourceUrls(searchPayload)
        .find((url) => isAllowedOfficialSource(url, officialSourceDomains));
      tokensIn += searchPayload.usage?.input_tokens ?? 0;
      tokensOut += searchPayload.usage?.output_tokens ?? 0;
      if (!approvedKnowledge || !sourceUrl) return null;
    }

    const replyPayload = await request({
      input: buildOpenAiUserPrompt(message, {
        ...context,
        approvedKnowledge,
        officialEducationTreatmentKey: undefined,
      }),
      instructions: buildSystemPrompt(),
      max_output_tokens: config.openAiMaxTokens,
      model: config.openAiModel,
      reasoning: { effort: "none" },
    });
    const text = extractOpenAiResponseText(replyPayload);
    if (!text) return null;
    tokensIn += replyPayload.usage?.input_tokens ?? 0;
    tokensOut += replyPayload.usage?.output_tokens ?? 0;

    return {
      model: config.openAiModel,
      text,
      tokensIn,
      tokensOut,
      ...(sourceUrl ? { sourceUrl } : {}),
    };
  } catch (error) {
    await reportOperationalError({
      error,
      extra: {
        openai_model: config.openAiModel,
      },
      source: "openai_api",
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
