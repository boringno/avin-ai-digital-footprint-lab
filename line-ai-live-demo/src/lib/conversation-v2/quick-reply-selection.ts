import { buildTreatmentReplyAssets } from "@/lib/clinic-facts/treatment-reply-assets";
import {
  canonicalTreatmentKey,
  normalizeClinicText,
  type ClinicConfig,
  type CustomerQuickReplyChoice,
} from "@/lib/clinic-config";

import type {
  ConversationV2State,
  PendingQuickReplyContract,
  PendingQuickReplyChoice,
  TrustedSemanticAnchor,
} from "./types";
import { isConversationV2AiAssistanceEnabled } from "./state";

export type ConversationV2QuickReplySelection = {
  launchConcernGroupKey?: string;
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
      conversationMove: semantic.conversationMove ?? "continue",
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
  owner: PendingQuickReplyContract["owner"];
}): ConversationV2QuickReplySelection | undefined {
  if (input.choice.semantic.kind === "launch_concern_group") {
    if (input.owner.kind !== "launch_concern") return undefined;
    return {
      ...(input.choice.nextStage ? { nextStage: input.choice.nextStage } : {}),
      launchConcernGroupKey: input.choice.semantic.groupKey,
      semanticAnchor: {
        areaKeys: [],
        concernKeys: [],
        conversationMove: "continue",
        dialogueReference: "active_subject",
        questionAspect: "overview",
        source: "exact_ontology",
        speechAct: "ask_concern",
        treatmentKeys: [],
      },
    };
  }

  if (input.choice.semantic.kind === "treatment") {
    if (input.owner.kind !== "launch_concern") return undefined;
    const treatmentKey = canonicalTreatmentKey(input.choice.semantic.treatmentKey);
    const treatment = input.clinic.treatmentList.find((item) => item.key === treatmentKey);
    if (!treatment) return undefined;
    return {
      ...(input.choice.nextStage ? { nextStage: input.choice.nextStage } : {}),
      semanticAnchor: {
        areaKeys: [],
        concernKeys: [],
        conversationMove: "start",
        dialogueReference: "explicit",
        questionAspect: "overview",
        source: "exact_ontology",
        speechAct: "learn_treatment",
        treatmentKeys: [treatmentKey],
      },
    };
  }

  if (input.owner.kind !== "treatment") return undefined;
  const treatment = input.clinic.treatmentList.find((item) => item.key === input.owner.treatmentKey);
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
        treatmentKeys: [input.owner.treatmentKey],
      },
    };
  }
  const asset = buildTreatmentReplyAssets(input.clinic).find((item) =>
    item.id === semantic.replyAssetId && item.treatmentKey === input.owner.treatmentKey,
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
      conversationMove: semantic.conversationMove ?? "continue",
      dialogueReference: "active_subject",
      questionAspect: semantic.questionAspect,
      replyAssetId: semantic.replyAssetId,
      source: "approved_asset",
      speechAct: "ask_treatment_detail",
      treatmentKeys: [input.owner.treatmentKey],
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
  /** Retained for decision telemetry; current clinic data revalidates the stored semantic asset. */
  snapshotId?: string;
  state: ConversationV2State;
}): ConversationV2QuickReplySelection | undefined {
  if (
    !isConversationV2AiAssistanceEnabled(input.state.control.mode) ||
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
    now.getTime() >= new Date(contract.expiresAt).getTime()
  ) return undefined;

  const normalizedMessage = normalizeClinicText(input.message);
  const exactChoices = contract.choices.filter(
    (choice) => choice.normalizedMessageText === normalizedMessage,
  );
  const affirmative = /^(?:好|好的|好啊|可以|可以啊|沒問題|幫我看|幫我看看|請幫我|麻煩你)$/u.test(normalizedMessage);
  const selectedChoices = exactChoices.length > 0
    ? exactChoices
    : affirmative && contract.choices.length === 1
      ? contract.choices
      : [];
  const matches = selectedChoices
    .map((choice) => selectionFromStoredChoice({
      choice,
      // A price-source readiness change may alter the full facts snapshot
      // between rendering and tapping. The persisted choice contains no price
      // data; resolve its stable asset identity against the current approved
      // clinic config instead of invalidating the customer-visible button.
      clinic: input.clinic,
      owner: contract.owner,
    }))
    .filter((selection): selection is ConversationV2QuickReplySelection => Boolean(selection));
  if (matches.length !== 1) return undefined;
  return structuredClone(matches[0]);
}
