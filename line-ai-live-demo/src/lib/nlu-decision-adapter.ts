import { clinicOntology, type ClinicOntology } from "@/lib/clinic-ontology";
import type { NluFrame } from "@/lib/nlu-frame";

export type NluDecisionMode = "canary" | "off" | "shadow";

export type NluDecisionGateConfig = {
  mode: NluDecisionMode;
  sampleRate: number;
};

export const DEFAULT_NLU_DECISION_GATE = {
  mode: "off",
  sampleRate: 0,
} as const satisfies NluDecisionGateConfig;

export type NluDecisionGateResult = {
  allowDecision: boolean;
  eligible: boolean;
  mode: NluDecisionMode;
  reason: "mode_off" | "sampled_out" | "shadow_only" | "canary_eligible";
  sampleBucket: number;
  sampleRate: number;
};

export type SemanticTreatmentConsultation = {
  area: string | null;
  concern: string;
  treatmentKey: string;
};

export type NluDecisionAbstainReason =
  | "invalid_frame"
  | "low_confidence"
  | "safety_present"
  | "negation_present"
  | "ambiguous_intent"
  | "unsupported_intent"
  | "ambiguous_treatment"
  | "ambiguous_concern"
  | "unknown_treatment"
  | "unknown_concern"
  | "unknown_area"
  | "concern_area_mismatch"
  | "treatment_concern_mismatch";

export type NluDecisionAdapterResult =
  | {
      confidence: number;
      kind: "semantic_consultation";
      semanticTreatmentConsultation: SemanticTreatmentConsultation;
    }
  | {
      kind: "abstain";
      reason: NluDecisionAbstainReason;
    };

export type NluDecisionAdapterOptions = {
  minimumConfidence?: number;
  ontology?: ClinicOntology;
};

export const DEFAULT_NLU_DECISION_MIN_CONFIDENCE = 0.9;

function clampSampleRate(sampleRate: number) {
  if (!Number.isFinite(sampleRate)) return 0;
  return Math.min(1, Math.max(0, sampleRate));
}

/**
 * FNV-1a is intentionally used instead of Math.random so one LINE user/message
 * remains in the same canary cohort across retries, instances, and deploys.
 */
export function stableNluSampleBucket(sampleKey: string) {
  let hash = 0x811c9dc5;
  const bytes = new TextEncoder().encode(sampleKey);
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash / 0x1_0000_0000;
}

export function evaluateNluDecisionGate(
  sampleKey: string,
  config: Partial<NluDecisionGateConfig> = DEFAULT_NLU_DECISION_GATE,
): NluDecisionGateResult {
  const requestedMode = config.mode ?? DEFAULT_NLU_DECISION_GATE.mode;
  const mode: NluDecisionMode = ["off", "shadow", "canary"].includes(requestedMode)
    ? requestedMode
    : DEFAULT_NLU_DECISION_GATE.mode;
  const sampleRate = clampSampleRate(config.sampleRate ?? DEFAULT_NLU_DECISION_GATE.sampleRate);
  const sampleBucket = stableNluSampleBucket(sampleKey);

  if (mode === "off") {
    return { allowDecision: false, eligible: false, mode, reason: "mode_off", sampleBucket, sampleRate };
  }

  if (sampleRate === 0 || sampleBucket >= sampleRate) {
    return { allowDecision: false, eligible: false, mode, reason: "sampled_out", sampleBucket, sampleRate };
  }

  if (mode === "shadow") {
    return { allowDecision: false, eligible: true, mode, reason: "shadow_only", sampleBucket, sampleRate };
  }

  return { allowDecision: true, eligible: true, mode, reason: "canary_eligible", sampleBucket, sampleRate };
}

function hasSafetySignal(frame: NluFrame) {
  return Object.values(frame.safety).some(Boolean);
}

export function adaptNluFrameToSemanticConsultation(
  frame: NluFrame | null | undefined,
  options: NluDecisionAdapterOptions = {},
): NluDecisionAdapterResult {
  if (!frame) return { kind: "abstain", reason: "invalid_frame" };

  const minimumConfidence = options.minimumConfidence ?? DEFAULT_NLU_DECISION_MIN_CONFIDENCE;
  if (!Number.isFinite(frame.confidence) || frame.confidence < minimumConfidence) {
    return { kind: "abstain", reason: "low_confidence" };
  }
  if (hasSafetySignal(frame)) return { kind: "abstain", reason: "safety_present" };
  if (frame.negated.length > 0) return { kind: "abstain", reason: "negation_present" };
  if (frame.intents.length !== 1) return { kind: "abstain", reason: "ambiguous_intent" };
  if (frame.intents[0] !== "treatment_consultation") {
    return { kind: "abstain", reason: "unsupported_intent" };
  }
  if (frame.treatments.length !== 1) return { kind: "abstain", reason: "ambiguous_treatment" };
  if (frame.concerns.length !== 1) return { kind: "abstain", reason: "ambiguous_concern" };

  const ontology = options.ontology ?? clinicOntology;
  const treatmentKey = frame.treatments[0];
  const concernFrame = frame.concerns[0];
  const treatment = ontology.treatments.find((candidate) => candidate.key === treatmentKey);
  if (!treatment) return { kind: "abstain", reason: "unknown_treatment" };

  const concern = ontology.concerns.find((candidate) => candidate.key === concernFrame.key);
  if (!concern) return { kind: "abstain", reason: "unknown_concern" };

  if (concernFrame.area !== null) {
    const areaExists = ontology.areas.some((candidate) => candidate.key === concernFrame.area);
    if (!areaExists) return { kind: "abstain", reason: "unknown_area" };
    if (!concern.areaKeys.some((areaKey) => areaKey === concernFrame.area)) {
      return { kind: "abstain", reason: "concern_area_mismatch" };
    }
  }

  if (!concern.recommendedTreatmentKeys.includes(treatmentKey)) {
    return { kind: "abstain", reason: "treatment_concern_mismatch" };
  }

  return {
    confidence: frame.confidence,
    kind: "semantic_consultation",
    semanticTreatmentConsultation: {
      area: concernFrame.area,
      concern: concern.key,
      treatmentKey: treatment.key,
    },
  };
}

export function resolveNluCanaryDecision(
  frame: NluFrame | null | undefined,
  sampleKey: string,
  gateConfig: Partial<NluDecisionGateConfig> = DEFAULT_NLU_DECISION_GATE,
  adapterOptions: NluDecisionAdapterOptions = {},
) {
  const gate = evaluateNluDecisionGate(sampleKey, gateConfig);
  if (!gate.allowDecision) {
    return {
      decision: { kind: "abstain", reason: gate.reason } as const,
      gate,
    };
  }

  return {
    decision: adaptNluFrameToSemanticConsultation(frame, adapterOptions),
    gate,
  };
}
