import { buildTreatmentReplyAssets } from "@/lib/clinic-facts/treatment-reply-assets";
import {
  normalizeClinicText,
  type ClinicConfig,
  type CustomerQuickReplyChoice,
} from "@/lib/clinic-config";

import type {
  ConversationV2State,
  PendingQuickReplyChoice,
  TrustedSemanticAnchor,
} from "./types";

export type ConversationV2QuickReplySelection = {
  nextStage?: "approach" | "followup" | "initial" | "consultation";
  semanticAnchor: TrustedSemanticAnchor;
};

/** Builds the compact approved identity persisted with an actually displayed choice. */
export function buildConversationV2QuickReplySelection(input: {
  choice: CustomerQuickReplyChoice;
  clinic: ClinicConfig;
  treatmentKey: string;
}): ConversationV2QuickReplySelection | undefined {
  const treatment = input.clinic.treatmentList.find((item) => item.key === input.treatmentKey);
  const guide = treatment?.consultationGuide;
  const semantic = input.choice.semantic;
  if (!treatment || !guide || !semantic) return undefined;

  if (semantic.type === "concern") {
    if (!guide.concernReplies?.some((item) => item.concernKey === semantic.concernKey)) {
      return undefined;
    }
    return {
      ...(input.choice.nextStage ? { nextStage: input.choice.nextStage } : {}),
      semanticAnchor: {
        areaKeys: [],
        concernKeys: [semantic.concernKey],
        conversationMove: "continue",
        dialogueReference: "active_subject",
        questionAspect: "overview",
        source: "exact_ontology",
        speechAct: "ask_concern",
        treatmentKeys: [input.treatmentKey],
      },
    };
  }

  const replyAssetId = `treatment:${input.treatmentKey}:${semantic.assetKind}:${semantic.assetKey}`;
  const asset = buildTreatmentReplyAssets(input.clinic).find((item) => item.id === replyAssetId);
  if (
    !asset ||
    asset.treatmentKey !== input.treatmentKey ||
    (semantic.concernKey && asset.concernKey !== semantic.concernKey)
  ) {
    return undefined;
  }
  return {
    ...(input.choice.nextStage ? { nextStage: input.choice.nextStage } : {}),
    semanticAnchor: {
      areaKeys: semantic.areaKey ? [semantic.areaKey] : [],
      concernKeys: semantic.concernKey
        ? [semantic.concernKey]
        : asset.concernKey
          ? [asset.concernKey]
          : [],
      conversationMove: "continue",
      dialogueReference: "active_subject",
      questionAspect: semantic.questionAspect,
      replyAssetId,
      source: "approved_asset",
      speechAct: "ask_treatment_detail",
      treatmentKeys: [input.treatmentKey],
    },
  };
}

function selectionFromStoredChoice(input: {
  choice: PendingQuickReplyChoice;
  clinic: ClinicConfig;
  treatmentKey: string;
}): ConversationV2QuickReplySelection | undefined {
  const treatment = input.clinic.treatmentList.find((item) => item.key === input.treatmentKey);
  const guide = treatment?.consultationGuide;
  if (!treatment || !guide) return undefined;
  const semantic = input.choice.semantic;
  if (semantic.kind === "concern") {
    if (!guide.concernReplies?.some((item) => item.concernKey === semantic.concernKey)) {
      return undefined;
    }
    return {
      ...(input.choice.nextStage ? { nextStage: input.choice.nextStage } : {}),
      semanticAnchor: {
        areaKeys: [],
        concernKeys: [semantic.concernKey],
        conversationMove: "continue",
        dialogueReference: "active_subject",
        questionAspect: "overview",
        source: "exact_ontology",
        speechAct: "ask_concern",
        treatmentKeys: [input.treatmentKey],
      },
    };
  }
  const asset = buildTreatmentReplyAssets(input.clinic).find((item) =>
    item.id === semantic.replyAssetId && item.treatmentKey === input.treatmentKey,
  );
  if (!asset || (semantic.concernKey && asset.concernKey !== semantic.concernKey)) return undefined;
  return {
    ...(input.choice.nextStage ? { nextStage: input.choice.nextStage } : {}),
    semanticAnchor: {
      areaKeys: semantic.areaKey ? [semantic.areaKey] : [],
      concernKeys: semantic.concernKey
        ? [semantic.concernKey]
        : asset.concernKey
          ? [asset.concernKey]
          : [],
      conversationMove: "continue",
      dialogueReference: "active_subject",
      questionAspect: semantic.questionAspect,
      replyAssetId: semantic.replyAssetId,
      source: "approved_asset",
      speechAct: "ask_treatment_detail",
      treatmentKeys: [input.treatmentKey],
    },
  };
}

/**
 * Resolves only the current, actually delivered choice contract. LINE sends
 * the same message event for a tap and identical free typing, so exact text is
 * intentionally accepted only while this one-turn offer is live.
 */
export function resolveConversationV2QuickReplySelection(input: {
  clinic: ClinicConfig;
  message: string;
  now?: Date;
  snapshotId?: string;
  state: ConversationV2State;
}): ConversationV2QuickReplySelection | undefined {
  if (
    input.state.control.mode !== "ai_active" ||
    input.state.bookingTask.status === "collecting"
  ) {
    return undefined;
  }
  const contract = input.state.pendingQuickReply;
  if (!contract) return undefined;
  const now = input.now ?? new Date();
  if (
    contract.episodeId !== input.state.episodeId ||
    !Number.isFinite(now.getTime()) ||
    now.getTime() >= new Date(contract.expiresAt).getTime() ||
    (input.snapshotId !== undefined && input.snapshotId !== contract.sourceSnapshotId)
  ) return undefined;

  const normalizedMessage = normalizeClinicText(input.message);
  const matches = contract.choices
    .filter((choice) => choice.normalizedMessageText === normalizedMessage)
    .map((choice) => selectionFromStoredChoice({
      choice,
      clinic: input.clinic,
      treatmentKey: contract.owner.treatmentKey,
    }))
    .filter((selection): selection is ConversationV2QuickReplySelection => Boolean(selection));
  if (matches.length !== 1) return undefined;
  return structuredClone(matches[0]);
}
