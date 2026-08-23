import { buildTreatmentReplyAssets } from "@/lib/clinic-facts/treatment-reply-assets";
import {
  normalizeClinicText,
  type ClinicConfig,
  type CustomerQuickReplyStage,
} from "@/lib/clinic-config";

import type { ConversationV2State, TrustedSemanticAnchor } from "./types";

export type ConversationV2QuickReplySelection = {
  nextStage?: CustomerQuickReplyStage | "consultation";
  semanticAnchor: TrustedSemanticAnchor;
};

function activeTreatmentKey(state: ConversationV2State) {
  return state.knowledge.treatmentKeys.length === 1
    ? state.knowledge.treatmentKeys[0]
    : undefined;
}

/**
 * Resolves only an exact customer-facing choice configured for the active
 * treatment. The result carries semantic identity, never clinic prose or a
 * price, and still passes through policy, state, facts hydration and guards.
 */
export function resolveConversationV2QuickReplySelection(input: {
  clinic: ClinicConfig;
  message: string;
  state: ConversationV2State;
}): ConversationV2QuickReplySelection | undefined {
  if (
    input.state.control.mode !== "ai_active" ||
    input.state.bookingTask.status === "collecting"
  ) {
    return undefined;
  }

  const treatmentKey = activeTreatmentKey(input.state);
  if (!treatmentKey) return undefined;
  const treatment = input.clinic.treatmentList.find((item) => item.key === treatmentKey);
  const guide = treatment?.consultationGuide;
  if (!treatment || !guide) return undefined;

  const normalizedMessage = normalizeClinicText(input.message);
  const matches = (guide.customerQuickReplies ?? []).filter((choice) =>
    choice.semantic &&
    normalizeClinicText(choice.text) === normalizedMessage &&
    (
      !choice.concernKeys?.length ||
      choice.concernKeys.some((key) => input.state.knowledge.concernKeys.includes(key))
    ),
  );
  if (matches.length === 0) return undefined;
  const semanticSignature = JSON.stringify({
    nextStage: matches[0]!.nextStage,
    semantic: matches[0]!.semantic,
  });
  if (matches.some((item) => JSON.stringify({
    nextStage: item.nextStage,
    semantic: item.semantic,
  }) !== semanticSignature)) {
    return undefined;
  }

  const choice = matches[0]!;
  const semantic = choice.semantic!;
  if (semantic.type === "concern") {
    if (!guide.concernReplies?.some((item) => item.concernKey === semantic.concernKey)) {
      return undefined;
    }
    return {
      ...(choice.nextStage ? { nextStage: choice.nextStage } : {}),
      semanticAnchor: {
        areaKeys: [],
        concernKeys: [semantic.concernKey],
        conversationMove: "continue",
        dialogueReference: "active_subject",
        questionAspect: "overview",
        source: "exact_ontology",
        speechAct: "ask_concern",
        treatmentKeys: [treatmentKey],
      },
    };
  }

  const replyAssetId = `treatment:${treatmentKey}:${semantic.assetKind}:${semantic.assetKey}`;
  const asset = buildTreatmentReplyAssets(input.clinic).find((item) => item.id === replyAssetId);
  if (
    !asset ||
    asset.treatmentKey !== treatmentKey ||
    (semantic.concernKey && asset.concernKey !== semantic.concernKey) ||
    (asset.concernKey && !input.state.knowledge.concernKeys.includes(asset.concernKey))
  ) {
    return undefined;
  }

  const concernKeys = semantic.concernKey
    ? [semantic.concernKey]
    : asset.concernKey
      ? [asset.concernKey]
      : [...input.state.knowledge.concernKeys];
  return {
    ...(choice.nextStage ? { nextStage: choice.nextStage } : {}),
    semanticAnchor: {
      areaKeys: semantic.areaKey ? [semantic.areaKey] : [...input.state.knowledge.areaKeys],
      concernKeys,
      conversationMove: "continue",
      dialogueReference: "active_subject",
      questionAspect: semantic.questionAspect,
      replyAssetId,
      source: "approved_asset",
      speechAct: "ask_treatment_detail",
      treatmentKeys: [treatmentKey],
    },
  };
}
