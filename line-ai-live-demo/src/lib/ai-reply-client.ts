import { generateClaudeReply, type ClaudeReplyContext } from "@/lib/claude-client";
import { getRuntimeConfig } from "@/lib/live-demo-config";
import { generateOpenAiReply } from "@/lib/openai-client";

export type AiReplyContext = ClaudeReplyContext;

export type GeneratedAiReply = {
  model: string;
  text: string;
  tokensIn: number;
  tokensOut: number;
};

export async function generateAiReply(message: string, context?: AiReplyContext): Promise<GeneratedAiReply | null> {
  const config = getRuntimeConfig();

  if (config.aiProvider === "openai") {
    return generateOpenAiReply(message, context);
  }

  return generateClaudeReply(message, context);
}
