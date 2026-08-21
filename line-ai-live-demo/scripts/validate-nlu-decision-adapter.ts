import assert from "node:assert/strict";

import { clinicOntology } from "../src/lib/clinic-ontology";
import type { NluFrame } from "../src/lib/nlu-frame";
import {
  adaptNluFrameToSemanticConsultation,
  DEFAULT_NLU_DECISION_GATE,
  evaluateNluDecisionGate,
  resolveNluCanaryDecision,
  stableNluSampleBucket,
} from "../src/lib/nlu-decision-adapter";
import { getRuntimeConfig } from "../src/lib/live-demo-config";

function frame(overrides: Partial<NluFrame> = {}): NluFrame {
  return {
    areas: [],
    confidence: 0.97,
    concerns: [{ area: "jawline", key: "jawline_looseness" }],
    dialogue: { focus: "overview", move: "start", reference: "explicit", speechAct: "learn_treatment" },
    intents: ["treatment_consultation"],
    negated: [],
    safety: {
      complaint: false,
      humanRequest: false,
      postTreatmentRisk: false,
      pregnancyNursing: false,
    },
    schemaVersion: 1,
    treatments: ["onda_pro"],
    ...overrides,
  };
}

function assertAbstains(input: NluFrame | null, reason: string) {
  const result = adaptNluFrameToSemanticConsultation(input);
  assert.equal(result.kind, "abstain", `${reason}: must abstain`);
  if (result.kind === "abstain") assert.equal(result.reason, reason, `${reason}: reason must be observable`);
}

function validateSingleClearCandidate() {
  const result = adaptNluFrameToSemanticConsultation(frame());
  assert.equal(result.kind, "semantic_consultation", "ND1: one clear, grounded frame may become semantic consultation");
  if (result.kind !== "semantic_consultation") return;
  assert.deepEqual(
    result.semanticTreatmentConsultation,
    { area: "jawline", concern: "jawline_looseness", treatmentKey: "onda_pro" },
    "ND1: adapter output must use ontology keys",
  );
  assert.equal(result.confidence, 0.97, "ND1: accepted confidence must remain available for audit");
}

function validateInjectedRecognitionSnapshot() {
  const ontology = {
    ...clinicOntology,
    concerns: [
      ...clinicOntology.concerns,
      {
        areaKeys: ["face" as const],
        key: "future_concern",
        keywords: ["未來困擾"],
        label: "未來困擾",
        recommendedTreatmentKeys: ["future_device"],
        summary: "fixture",
      },
    ],
    treatments: [
      ...clinicOntology.treatments,
      { aliases: ["未來儀器"], category: "energy" as const, key: "future_device", name: "未來儀器" },
    ],
  };
  const dynamicFrame = frame({
    concerns: [{ area: "face", key: "future_concern" }],
    treatments: ["future_device"],
  });
  assert.equal(
    adaptNluFrameToSemanticConsultation(dynamicFrame).kind,
    "abstain",
    "a future key must not be accepted without its pinned recognition snapshot",
  );
  assert.equal(
    adaptNluFrameToSemanticConsultation(dynamicFrame, { ontology }).kind,
    "semantic_consultation",
    "the decision adapter must use the same injected recognition snapshot as NLU",
  );
}

function validateFailClosedFrames() {
  assertAbstains(null, "invalid_frame");
  assertAbstains(frame({ confidence: 0.89 }), "low_confidence");
  assertAbstains(frame({ safety: { ...frame().safety, pregnancyNursing: true } }), "safety_present");
  assertAbstains(frame({ negated: [{ key: "onda_pro", type: "treatment" }] }), "negation_present");
  assertAbstains(frame({ intents: ["treatment_consultation", "pricing"] }), "ambiguous_intent");
  assertAbstains(frame({ intents: ["pricing"] }), "unsupported_intent");
  assertAbstains(frame({ treatments: ["onda_pro", "botox"] }), "ambiguous_treatment");
  assertAbstains(
    frame({ concerns: [{ area: "jawline", key: "jawline_looseness" }, { area: "body", key: "local_contour" }] }),
    "ambiguous_concern",
  );
  assertAbstains(frame({ treatments: ["not_in_ontology"] }), "unknown_treatment");
  assertAbstains(frame({ concerns: [{ area: "jawline", key: "not_in_ontology" }] }), "unknown_concern");
  assertAbstains(frame({ concerns: [{ area: "not_in_ontology", key: "jawline_looseness" }] }), "unknown_area");
  assertAbstains(frame({ concerns: [{ area: "abdomen", key: "jawline_looseness" }] }), "concern_area_mismatch");
  assertAbstains(
    frame({ concerns: [{ area: "skin", key: "pores_texture" }], treatments: ["onda_pro"] }),
    "treatment_concern_mismatch",
  );
}

function validateStableGate() {
  const defaults = evaluateNluDecisionGate("user-1");
  assert.deepEqual(DEFAULT_NLU_DECISION_GATE, { mode: "off", sampleRate: 0 }, "ND3: public gate defaults must be off/zero");
  assert.equal(defaults.eligible, false, "ND3: omitted config must never run NLU");
  assert.equal(defaults.allowDecision, false, "ND3: omitted config must never affect routing");
  assert.equal(defaults.reason, "mode_off", "ND3: default-off reason must be explicit");

  const bucket = stableNluSampleBucket("line-user:event-123");
  assert.equal(bucket, stableNluSampleBucket("line-user:event-123"), "ND3: retry must remain in the same cohort");
  assert(bucket >= 0 && bucket < 1, "ND3: stable bucket must be in [0, 1)");

  const shadow = evaluateNluDecisionGate("user-1", { mode: "shadow", sampleRate: 1 });
  assert.equal(shadow.eligible, true, "ND3: sampled shadow traffic may run observation");
  assert.equal(shadow.allowDecision, false, "ND3: shadow must never affect routing");
  assert.equal(shadow.reason, "shadow_only", "ND3: shadow status must be explicit");

  const canary = evaluateNluDecisionGate("user-1", { mode: "canary", sampleRate: 1 });
  assert.equal(canary.eligible, true, "ND3: sampled canary traffic is eligible");
  assert.equal(canary.allowDecision, true, "ND3: only canary may affect routing");

  const sampledOut = evaluateNluDecisionGate("user-1", { mode: "canary", sampleRate: 0 });
  assert.equal(sampledOut.eligible, false, "ND3: zero sample rate must always sample out");
  assert.equal(sampledOut.allowDecision, false, "ND3: sampled-out traffic must not affect routing");

  const offEvenAtOne = evaluateNluDecisionGate("user-1", { mode: "off", sampleRate: 1 });
  assert.equal(offEvenAtOne.allowDecision, false, "ND3: mode off must win over sampleRate=1");

  const invalidMode = evaluateNluDecisionGate("user-1", { mode: "decision" as "canary", sampleRate: 1 });
  assert.equal(invalidMode.mode, "off", "ND3: an invalid runtime mode must fail closed to off");
  assert.equal(invalidMode.allowDecision, false, "ND3: an invalid runtime mode must never affect routing");
}

function validateCombinedCanaryResolution() {
  const off = resolveNluCanaryDecision(frame(), "user-1");
  assert.equal(off.gate.allowDecision, false, "ND4: combined resolver must default off");
  assert.equal(off.decision.kind, "abstain", "ND4: default-off resolver must abstain before adapting");

  const shadow = resolveNluCanaryDecision(frame(), "user-1", { mode: "shadow", sampleRate: 1 });
  assert.equal(shadow.decision.kind, "abstain", "ND4: shadow resolver must never produce route input");

  const canary = resolveNluCanaryDecision(frame(), "user-1", { mode: "canary", sampleRate: 1 });
  assert.equal(canary.decision.kind, "semantic_consultation", "ND4: eligible canary may produce route input");

  const unsafeCanary = resolveNluCanaryDecision(
    frame({ safety: { ...frame().safety, postTreatmentRisk: true } }),
    "user-1",
    { mode: "canary", sampleRate: 1 },
  );
  assert.equal(unsafeCanary.decision.kind, "abstain", "ND4: canary gate must not bypass adapter safety abstention");
}

function validateRuntimeDecisionFlagDefaultsOff() {
  const original = process.env.OPENAI_NLU_DECISION_MODE;
  try {
    delete process.env.OPENAI_NLU_DECISION_MODE;
    assert.equal(getRuntimeConfig().openAiNluDecisionMode, "off", "ND5: customer-visible NLU decisions must default off");
    process.env.OPENAI_NLU_DECISION_MODE = "canary";
    assert.equal(getRuntimeConfig().openAiNluDecisionMode, "canary", "ND5: explicit canary value must be accepted");
    process.env.OPENAI_NLU_DECISION_MODE = "decision";
    assert.throws(() => getRuntimeConfig(), /Unsupported OPENAI_NLU_DECISION_MODE/u, "ND5: full decision mode must stay unavailable");
  } finally {
    if (original === undefined) delete process.env.OPENAI_NLU_DECISION_MODE;
    else process.env.OPENAI_NLU_DECISION_MODE = original;
  }
}

validateSingleClearCandidate();
validateInjectedRecognitionSnapshot();
validateFailClosedFrames();
validateStableGate();
validateCombinedCanaryResolution();
validateRuntimeDecisionFlagDefaultsOff();

console.log("NLU decision adapter validation passed (5 scenario families, 52 assertions)");
