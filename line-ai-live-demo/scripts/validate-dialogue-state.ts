import assert from "node:assert/strict";

import { createEmptyConversationContext } from "../src/lib/conversation-context";
import { createEmptyConversationState } from "../src/lib/conversation-state";
import {
  createDialogueRuntime,
  hydrateDialogueState,
  repairBookingStateOnRead,
  reduceDialogueRuntime,
  reduceDialogueState,
  synchronizeDialogueStateFromLegacy,
} from "../src/lib/dialogue-state";

const NOW = "2026-08-12T08:00:00.000Z";

function oldBookingContext() {
  const context = createEmptyConversationContext("dialogue-test");
  context.bookingDraft = {
    branch: "高雄館",
    campaignId: "onda-old",
    campaignName: "舊活動",
    isFirstVisit: "yes",
    name: "阿溫",
    phone: "0912345678",
    requestedTimeSlots: [],
    timeSlots: ["8月18日下午"],
    treatment: "ONDA PRO",
  };
  context.bookingSession = { action: "use_current", lastActiveAt: NOW, status: "collecting" };
  context.lastIntent = "booking_intake";
  context.lastSeenAt = NOW;
  context.treatmentConsultation = {
    answeredAspectKeys: ["concern:jawline_looseness:overview"],
    concernKeys: ["jawline_looseness"],
    primaryConcernKey: "jawline_looseness",
    stage: "priority_selected",
    treatmentKey: "onda_pro",
  };
  return context;
}

function runtimeFromOldBooking() {
  return createDialogueRuntime(oldBookingContext(), createEmptyConversationState("dialogue-test"), {
    episodeIdFactory: () => "episode-test",
    now: new Date(NOW),
  });
}

function validateHydrationAndLifecycleAuthority() {
  const context = oldBookingContext();
  const lifecycle = {
    ...createEmptyConversationState("dialogue-test"),
    status: "human_active" as const,
  };
  const hydrated = hydrateDialogueState(context, lifecycle, {
    episodeIdFactory: () => "episode-hydrated",
    now: new Date(NOW),
  });

  assert.equal(hydrated.schemaVersion, 1, "DS1: hydrated state must be versioned");
  assert.equal(hydrated.episodeId, "episode-hydrated", "DS1: episode id factory must be honored");
  assert.equal(hydrated.bookingIntent, "create", "DS1: legacy booking intake must hydrate as create");
  assert.equal(hydrated.bookingAction, "use_current", "DS1: booking action must hydrate from booking session");
  assert.equal(hydrated.handoffStatus, "human_active", "DS1: lifecycle state must own handoff status");
  assert.deepEqual(hydrated.treatmentKeys, ["onda_pro"], "DS1: booking treatment names must resolve to ontology keys");
}

function validateImmutableStateReducer() {
  const runtime = runtimeFromOldBooking();
  const before = structuredClone(runtime.dialogue);
  const next = reduceDialogueState(runtime.dialogue, {
    concernKeys: ["local_contour"],
    source: "explicit",
    type: "entities_observed",
  });

  assert.deepEqual(runtime.dialogue, before, "DS2: reducer must not mutate its input state");
  assert.notEqual(next, runtime.dialogue, "DS2: reducer must return a new object");
  assert(next.concernKeys.includes("local_contour"), "DS2: observed concern must be recorded");
}

function validateReplacementStartsFreshDraft() {
  const runtime = runtimeFromOldBooking();
  const replaced = reduceDialogueRuntime(runtime, {
    action: "replace",
    at: "2026-08-12T08:01:00.000Z",
    intent: "create",
    treatmentKey: "botox",
    treatmentName: "肉毒",
    type: "booking_started",
  });

  assert.equal(replaced.legacyContext.bookingDraft.treatment, "肉毒", "DS3: replacement must own only the new treatment");
  assert.equal(replaced.legacyContext.bookingDraft.branch, undefined, "DS3: replacement must clear old branch");
  assert.equal(replaced.legacyContext.bookingDraft.campaignId, undefined, "DS3: replacement must clear old campaign");
  assert.deepEqual(replaced.legacyContext.bookingDraft.timeSlots, [], "DS3: replacement must clear old times");
  assert.equal(replaced.legacyContext.bookingDraft.name, undefined, "DS3: draft must not silently reuse name");
  assert.equal(replaced.legacyContext.bookingDraft.phone, undefined, "DS3: draft must not silently reuse phone");
  assert.equal(replaced.legacyContext.customerProfile?.name, "阿溫", "DS3: known name may remain in customer profile");
  assert.equal(replaced.legacyContext.customerProfile?.phone, "0912345678", "DS3: known phone may remain in customer profile");
  assert.equal(replaced.dialogue.bookingAction, "replace", "DS3: replacement ownership must be canonical");
  assert.equal(replaced.legacyContext.bookingSession?.action, "replace", "DS3: replacement ownership must project downstream");
  assert.equal(runtime.legacyContext.bookingDraft.branch, "高雄館", "DS3: runtime reducer must not mutate the original draft");

  const followup = reduceDialogueRuntime(replaced, {
    at: "2026-08-12T08:01:30.000Z",
    branch: "高雄館",
    type: "booking_fields_captured",
  });
  assert.equal(followup.legacyContext.bookingDraft.treatment, "肉毒", "DS3: follow-up must not re-add the previous ONDA consultation");
  assert.equal(followup.legacyContext.bookingDraft.branch, "高雄館", "DS3: follow-up must collect the new branch");
  assert.equal(followup.dialogue.bookingAction, "replace", "DS3: replacement ownership must survive follow-up");
}

function validateExplicitAdditionPreservesDraft() {
  const runtime = runtimeFromOldBooking();
  const added = reduceDialogueRuntime(runtime, {
    action: "add",
    at: "2026-08-12T08:02:00.000Z",
    intent: "create",
    treatmentKey: "botox",
    treatmentName: "肉毒",
    type: "booking_started",
  });

  assert.equal(added.legacyContext.bookingDraft.treatment, "ONDA PRO、肉毒", "DS4: explicit add must retain both treatments");
  assert.equal(added.legacyContext.bookingDraft.branch, "高雄館", "DS4: explicit add must preserve branch");
  assert.deepEqual(added.legacyContext.bookingDraft.timeSlots, ["8月18日下午"], "DS4: explicit add must preserve times");
  assert.equal(added.dialogue.bookingAction, "add", "DS4: add ownership must be canonical");
}

function validateGenericBookingInheritsOnlyConsultationTreatment() {
  const runtime = runtimeFromOldBooking();
  const generic = reduceDialogueRuntime(runtime, {
    action: "replace",
    at: "2026-08-12T08:03:00.000Z",
    inheritTreatmentKey: "onda_pro",
    inheritTreatmentName: "ONDA PRO",
    intent: "create",
    type: "booking_started",
  });

  assert.equal(generic.legacyContext.bookingDraft.treatment, "ONDA PRO", "DS5: generic booking may inherit active consultation treatment");
  assert.equal(generic.legacyContext.bookingDraft.branch, undefined, "DS5: generic booking must not inherit old branch");
  assert.equal(generic.legacyContext.bookingDraft.campaignId, undefined, "DS5: generic booking must not inherit old campaign");
  assert.deepEqual(generic.legacyContext.bookingDraft.timeSlots, [], "DS5: generic booking must not inherit old times");
  assert.equal(generic.dialogue.bookingAction, "replace", "DS5: generic booking must still start a fresh draft");
}

function validateBookingTimeOwnership() {
  const runtime = runtimeFromOldBooking();
  const modifying = reduceDialogueRuntime(runtime, {
    action: "use_current",
    at: "2026-08-12T08:04:00.000Z",
    intent: "modify",
    type: "booking_started",
  });
  const captured = reduceDialogueRuntime(modifying, {
    at: "2026-08-12T08:04:30.000Z",
    timeSlots: ["8月20日上午"],
    type: "booking_fields_captured",
  });

  assert.deepEqual(captured.legacyContext.bookingDraft.requestedTimeSlots, ["8月20日上午"], "DS6: modify times must belong to requestedTimeSlots");
  assert.deepEqual(captured.legacyContext.bookingDraft.timeSlots, ["8月18日下午"], "DS6: modify must preserve confirmed/current times");
}

function validateConsultationSwitchAndCorrection() {
  let runtime = runtimeFromOldBooking();
  runtime = reduceDialogueRuntime(runtime, {
    at: "2026-08-12T08:05:00.000Z",
    treatmentKey: "botox",
    type: "consultation_started",
  });
  assert.deepEqual(runtime.dialogue.concernKeys, [], "DS7: switching treatment must reset concerns");
  assert.deepEqual(runtime.dialogue.answeredTopics, [], "DS7: switching treatment must reset answered topics");

  runtime = reduceDialogueRuntime(runtime, {
    aspectKey: "concern:dynamic_wrinkles:overview",
    concernKey: "dynamic_wrinkles",
    treatmentKey: "botox",
    type: "consultation_concern_recorded",
  });
  assert.deepEqual(runtime.dialogue.concernKeys, ["dynamic_wrinkles"], "DS7: consultation concern must be recorded");
  assert.deepEqual(runtime.dialogue.answeredTopics, ["concern:dynamic_wrinkles:overview"], "DS7: answered aspect must be recorded");
  assert.equal(runtime.legacyContext.treatmentConsultation?.treatmentKey, "botox", "DS7: canonical consultation must project to legacy context");

  const corrected = reduceDialogueRuntime(runtime, {
    concernKey: "masseter_fullness",
    treatmentKey: "botox",
    type: "consultation_focus_corrected",
  });
  assert.deepEqual(corrected.dialogue.concernKeys, ["masseter_fullness"], "DS7: correction must replace the concern set");
  assert.deepEqual(corrected.dialogue.answeredTopics, [], "DS7: correction must reset answered topics");
}

function validatePersistedStateDoesNotDuplicateHandoffAuthority() {
  const runtime = runtimeFromOldBooking();
  const handedOff = reduceDialogueRuntime(runtime, {
    at: "2026-08-12T08:06:00.000Z",
    reason: "customer_request",
    status: "handoff_pending",
    type: "handoff_transition",
  });

  assert.equal(handedOff.lifecycle.status, "handoff_pending", "DS8: lifecycle must receive handoff transition");
  assert.equal(handedOff.dialogue.handoffStatus, "handoff_pending", "DS8: materialized dialogue state must reflect lifecycle");
  assert(!("handoffStatus" in (handedOff.legacyContext.dialogueState ?? {})), "DS8: persisted dialogue state must not duplicate handoff authority");
}

function validateMaterializationAndLegacySyncBoundaries() {
  const context = oldBookingContext();
  context.dialogueState = {
    answeredTopics: [],
    areaKeys: [],
    bookingAction: "use_current",
    bookingIntent: "create",
    concernKeys: ["jawline_looseness"],
    dialogueAct: "handle_objection",
    episodeId: "canonical-wins",
    knownNeeds: [{ key: "jawline_looseness", kind: "concern", source: "explicit" }],
    lastTransitionAt: NOW,
    schemaVersion: 1,
    topic: "booking",
    treatmentKeys: ["onda_pro"],
  };
  const lifecycle = { ...createEmptyConversationState("dialogue-test"), status: "handoff_pending" as const };
  const materialized = hydrateDialogueState(context, lifecycle, { now: new Date(NOW) });
  assert.equal(materialized.dialogueAct, "handle_objection", "DS9: final materialization must preserve the canonical route act");
  assert.equal(materialized.handoffStatus, "handoff_pending", "DS9: final materialization must overlay authoritative lifecycle status");

  const migrated = synchronizeDialogueStateFromLegacy(context, lifecycle, { now: new Date(NOW) });
  assert.equal(migrated.dialogueState?.episodeId, "canonical-wins", "DS9: transitional legacy sync may preserve an unchanged episode id");
  assert.notEqual(migrated.dialogueState?.dialogueAct, "handle_objection", "DS9: legacy sync is migration-only and must not be used after final policy selection");
}

function validatePollutedBookingStateRepairsOnRead() {
  const context = oldBookingContext();
  context.lastIntent = "treatment_intro:onda_pro";
  context.activeFocus = {
    answeredTopics: [],
    areaKeys: [],
    awaiting: { kind: "concern", questionSummary: "確認想改善的部位或困擾" },
    bookingExplicit: false,
    concernKeys: [],
    goal: "learn_treatment",
    treatmentKey: "onda_pro",
  };
  context.dialogueState = {
    answeredTopics: [],
    areaKeys: [],
    awaiting: { kind: "branch", questionSummary: "收集預約所需資料" },
    bookingAction: "use_current",
    bookingIntent: "create",
    concernKeys: [],
    dialogueAct: "collect_booking",
    episodeId: "polluted-booking-state",
    knownNeeds: [],
    lastTransitionAt: NOW,
    schemaVersion: 1,
    topic: "booking",
    treatmentKeys: ["onda_pro"],
  };

  const repaired = repairBookingStateOnRead(context, { now: new Date(NOW) });
  const hydrated = hydrateDialogueState(repaired, createEmptyConversationState("dialogue-test"), { now: new Date(NOW) });

  assert.equal(context.bookingSession?.status, "collecting", "DS10: read repair must not mutate the supplied context");
  assert.equal(repaired.bookingDraft.treatment, "ONDA PRO", "DS10: repair must preserve the customer's booking draft");
  assert.equal(repaired.bookingSession?.status, "stale", "DS10: conflicting legacy booking ownership must be suspended");
  assert.equal(repaired.activeFocus?.bookingExplicit, false, "DS10: legacy bookingExplicit must be cleared");
  assert.equal(repaired.dialogueState?.bookingIntent, "none", "DS10: persisted canonical booking intent must be cleared");
  assert.equal(hydrated.bookingIntent, "none", "DS10: future hydration must not revive the polluted booking intent");
  assert.equal(hydrated.topic, "treatment", "DS10: the winning treatment task must own the repaired state");

  const canonicalTreatment = oldBookingContext();
  canonicalTreatment.activeFocus = {
    answeredTopics: [],
    areaKeys: [],
    awaiting: { kind: "branch", questionSummary: "收集預約所需資料" },
    bookingExplicit: true,
    concernKeys: ["jawline_looseness"],
    goal: "book_consultation",
    treatmentKey: "onda_pro",
  };
  canonicalTreatment.dialogueState = {
    answeredTopics: [],
    areaKeys: [],
    awaiting: { kind: "priority", questionSummary: "比較療程差異" },
    bookingAction: "use_current",
    bookingIntent: "create",
    concernKeys: ["jawline_looseness"],
    dialogueAct: "compare_options",
    episodeId: "canonical-treatment-wins",
    knownNeeds: [{ key: "jawline_looseness", kind: "concern", source: "explicit" }],
    lastTransitionAt: NOW,
    schemaVersion: 1,
    topic: "treatment",
    treatmentKeys: ["onda_pro"],
  };

  const canonicalRepaired = repairBookingStateOnRead(canonicalTreatment, { now: new Date(NOW) });
  assert.equal(canonicalRepaired.dialogueState?.topic, "treatment", "DS10b: canonical treatment topic must win over legacy booking focus");
  assert.equal(canonicalRepaired.dialogueState?.dialogueAct, "compare_options", "DS10b: canonical treatment act must survive repair");
  assert.equal(canonicalRepaired.dialogueState?.bookingIntent, "none", "DS10b: canonical treatment cannot retain create intent");
  assert.equal(canonicalRepaired.activeFocus?.goal, "compare_options", "DS10b: legacy focus must align to the winning canonical treatment task");
  assert.equal(canonicalRepaired.activeFocus?.bookingExplicit, false, "DS10b: aligned legacy focus must clear booking ownership");
  assert.equal(canonicalRepaired.dialogueState?.awaiting?.kind, "priority", "DS10b: a valid canonical treatment question must survive repair");
  assert.equal(canonicalRepaired.activeFocus?.awaiting?.kind, "priority", "DS10b: valid treatment awaiting must project to legacy focus");
  assert.equal(canonicalRepaired.bookingSession?.status, "stale", "DS10b: conflicting booking session must be suspended");
  assert.equal(canonicalRepaired.bookingDraft.treatment, "ONDA PRO", "DS10b: exact contradictory repair must preserve draft data");

  const bookingAwaitingPollution = structuredClone(canonicalTreatment);
  bookingAwaitingPollution.dialogueState!.awaiting = { kind: "branch", questionSummary: "收集預約館別" };
  const awaitingRepaired = repairBookingStateOnRead(bookingAwaitingPollution, { now: new Date(NOW) });
  assert.equal(awaitingRepaired.dialogueState?.topic, "treatment", "DS10c: treatment still owns the repaired task");
  assert.equal(awaitingRepaired.dialogueState?.awaiting, undefined, "DS10c: booking-only canonical awaiting must not leak into treatment");
  assert.equal(awaitingRepaired.activeFocus?.awaiting, undefined, "DS10c: booking-only legacy awaiting must be cleared with booking ownership");
}

validateHydrationAndLifecycleAuthority();
validateImmutableStateReducer();
validateReplacementStartsFreshDraft();
validateExplicitAdditionPreservesDraft();
validateGenericBookingInheritsOnlyConsultationTreatment();
validateBookingTimeOwnership();
validateConsultationSwitchAndCorrection();
validatePersistedStateDoesNotDuplicateHandoffAuthority();
validateMaterializationAndLegacySyncBoundaries();
validatePollutedBookingStateRepairsOnRead();

console.log("dialogue state validation passed (10 scenario families, including polluted booking read repair)");
