import { generateClaudeReply, type ClaudeReplyContext } from "@/lib/claude-client";
import { getRuntimeConfig } from "@/lib/live-demo-config";
import { generateOpenAiReply } from "@/lib/openai-client";

export type AiReplyContext = ClaudeReplyContext;

export type GeneratedAiReply = {
  model: string;
  sourceUrl?: string;
  text: string;
  tokensIn: number;
  tokensOut: number;
};

export async function generateAiReply(message: string, context?: AiReplyContext): Promise<GeneratedAiReply | null> {
  const config = getRuntimeConfig();

  if (config.aiProvider === "openai") {
    return generateOpenAiReply(message, context);
  }

  // The Claude integration has no configured official web-search tool. Never
  // imply that it searched; let the router's deterministic reply handle this.
  if (context?.officialEducationTreatmentKey) {
    return null;
  }

  return generateClaudeReply(message, context);
}
