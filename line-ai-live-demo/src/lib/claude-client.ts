import {
  buildCustomerServiceSystemPrompt,
  buildCustomerServiceUserPrompt,
  type AiCustomerReplyContext,
} from "@/lib/ai-customer-policy";
import { getRuntimeConfig } from "@/lib/live-demo-config";
import { reportOperationalError } from "@/lib/monitoring";

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
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
};

export type GeneratedClaudeReply = {
  model: string;
  text: string;
  tokensIn: number;
  tokensOut: number;
};

export type ClaudeReplyContext = AiCustomerReplyContext;

let claudeReplyInvocationCount = 0;

export function buildClaudeSystemPrompt() {
  return buildCustomerServiceSystemPrompt({ nightMode: true });
}

export function buildClaudeUserPrompt(message: string, context?: ClaudeReplyContext) {
  return buildCustomerServiceUserPrompt(message, context);
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

export async function generateClaudeReply(message: string, context?: ClaudeReplyContext): Promise<GeneratedClaudeReply | null> {
  claudeReplyInvocationCount += 1;
  const config = getRuntimeConfig();
  if (!config.claudeApiEnabled || !config.anthropicApiKey) {
    return null;
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(new Error("Claude reply generation timed out")), config.aiReplyGenerationTimeoutMs);
  try {
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
            content: buildClaudeUserPrompt(message, context),
            role: "user",
          },
        ],
        model: config.anthropicModel,
        system: buildClaudeSystemPrompt(),
        temperature: 0.2,
      }),
      signal: abortController.signal,
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

    return {
      model: config.anthropicModel,
      text: extractTextFromClaudeResponse(payload),
      tokensIn: payload.usage?.input_tokens ?? 0,
      tokensOut: payload.usage?.output_tokens ?? 0,
    };
  } catch (error) {
    await reportOperationalError({
      error,
      extra: {
        claude_model: config.anthropicModel,
      },
      source: "claude_api",
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function getClaudeReplyInvocationCount() {
  return claudeReplyInvocationCount;
}

export function resetClaudeReplyInvocationCount() {
  claudeReplyInvocationCount = 0;
}
