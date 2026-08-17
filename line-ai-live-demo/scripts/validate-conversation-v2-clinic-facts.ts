import {
  clinicConfig,
  type ClinicConfig,
  type TreatmentConfig,
} from "../src/lib/clinic-config";
import { buildClinicOntology } from "../src/lib/clinic-ontology";
import type { DialogueState } from "../src/lib/dialogue-state";
import {
  createStaticClinicFactsProvider,
  loadClinicFactsSnapshot,
  resolveApprovedPrice,
  resolveClinicInfo,
  resolveTreatmentFact,
  resolveTreatmentKnowledge,
  type PriceCatalogEntry,
} from "../src/lib/clinic-facts";
import {
  hydrateConversationV2ReplyPlan,
  routeConversationTurnV2,
} from "../src/lib/conversation-v2";
import { adaptNluFrameToConversationV2Turn } from "../src/lib/conversation-v2/nlu-adapter";
import { createConversationV2State } from "../src/lib/conversation-v2/state";
import type { TurnUnderstanding } from "../src/lib/conversation-v2/types";
import {
  buildNluInstructions,
  buildNluResponseFormat,
  parseNluFrame,
  type NluFrame,
} from "../src/lib/nlu-frame";
import { buildApprovedKnowledge } from "../src/lib/reply-plan";
import { renderReplyPlan } from "../src/lib/reply-renderer";
import { loadSeedData, type PricingCampaign } from "../src/lib/seed-loader";
import {
  createTreatmentKnowledgeResolver,
  treatmentKnowledgeResolver,
} from "../src/lib/treatment-knowledge";

const NOW = new Date("2026-08-14T10:00:00+08:00");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function campaign(overrides: Partial<PriceCatalogEntry> = {}): PriceCatalogEntry {
  const value: PriceCatalogEntry = {
    approval_status: "approved",
    asset_urls: "",
    branch_scope: "all",
    booking_treatments: "",
    campaign_aliases: "ONDA|ONDA PRO",
    campaign_name: "2026/08/01-08/31 體驗方案",
    customer_price_approval_status: "approved",
    customer_price_text: "體驗價 16,888",
    end_date: "2026-08-31",
    fallback_message: "活動內容依現場評估調整。",
    id: "price-onda-current",
    is_active: "true",
    notes: "validator",
    price_text: "體驗價 16,888",
    start_date: "2026-08-01",
    treatment_name: "ONDA PRO",
    ...overrides,
  };
  if (
    Object.prototype.hasOwnProperty.call(overrides, "price_text") &&
    !Object.prototype.hasOwnProperty.call(overrides, "customer_price_text")
  ) {
    value.customer_price_text = overrides.price_text;
  }
  return value;
}

function futureRegistryFixture() {
  const treatment: TreatmentConfig = {
    aliases: ["未來儀器"],
    approvedContent: {
      brandReplies: [],
      introReplies: ["未來儀器的核准介紹。"],
      unsupportedReply: "資料確認中。",
    },
    category: "energy",
    educationMode: "general_education",
    evaluationNote: "實際仍需由醫師評估。",
    intro: "未來儀器的核准介紹。",
    key: "future_device",
    name: "Future Device",
    officialSourceDomains: ["example.com"],
  };
  const config: ClinicConfig = {
    ...clinicConfig,
    concernList: [
      ...clinicConfig.concernList,
      {
        areaKeys: ["face"],
        key: "future_concern",
        keywords: ["未來困擾"],
        recommendedTreatmentKeys: ["future_device"],
        summary: "未來困擾可評估方向。",
      },
    ],
    treatmentList: [...clinicConfig.treatmentList, treatment],
  };
  return {
    config,
    knowledge: createTreatmentKnowledgeResolver(config).list(),
    ontology: buildClinicOntology(config),
    treatment,
  };
}

function futureNluFrame(
  overrides: Partial<NluFrame> & { speechAct?: NluFrame["dialogue"]["speechAct"] } = {},
): NluFrame {
  const { speechAct, ...frameOverrides } = overrides;
  return {
    areas: ["face"],
    confidence: 0.95,
    concerns: [{ area: "face", key: "future_concern" }],
    dialogue: {
      focus: "overview",
      move: "start",
      reference: "explicit",
      speechAct: speechAct ?? "learn_treatment",
    },
    intents: ["treatment"],
    negated: [],
    safety: {
      complaint: false,
      humanRequest: false,
      postTreatmentRisk: false,
      pregnancyNursing: false,
    },
    schemaVersion: 2,
    treatments: ["future_device"],
    ...frameOverrides,
  };
}

async function snapshot(options: Parameters<typeof createStaticClinicFactsProvider>[0] = {}) {
  return loadClinicFactsSnapshot(createStaticClinicFactsProvider(options), { now: NOW });
}

function assertThrows(action: () => void, message: string) {
  let threw = false;
  try {
    action();
  } catch {
    threw = true;
  }
  assert(threw, message);
}

async function assertSnapshotRejects(
  options: Parameters<typeof createStaticClinicFactsProvider>[0],
  expectedMessage: RegExp,
  message: string,
) {
  let error: unknown;
  try {
    await snapshot(options);
  } catch (caught) {
    error = caught;
  }
  assert(error instanceof Error && expectedMessage.test(error.message), message);
}

function turn(overrides: Partial<TurnUnderstanding>): TurnUnderstanding {
  return {
    areas: [],
    confidence: 0.95,
    concerns: [],
    conversationMove: "start",
    dialogueReference: "explicit",
    questionAspect: "overview",
    receivedAt: NOW.toISOString(),
    speechAct: "learn_treatment",
    text: "想了解療程",
    treatments: [],
    turnId: "turn-default",
    ...overrides,
  };
}

function rendererDialogueState(): DialogueState {
  return {
    answeredTopics: [],
    areaKeys: [],
    bookingAction: null,
    bookingIntent: "none",
    concernKeys: [],
    dialogueAct: "introduce_treatment",
    episodeId: "clinic-facts-renderer",
    handoffStatus: "ai_active",
    knownNeeds: [],
    lastTransitionAt: NOW.toISOString(),
    primaryConcernKey: undefined,
    schemaVersion: 1,
    topic: "treatment",
    treatmentKeys: ["onda_pro"],
  };
}

async function validateTreatmentTriStateAndPartialProfiles() {
  const partialBranchKnowledge = treatmentKnowledgeResolver.list().map((item) =>
    item.key === "onda_pro"
      ? {
          ...item,
          clinicAvailability: {
            branchNames: clinicConfig.branches.filter((branch) => branch.isActive).map((branch) => branch.name),
            isAvailable: true,
            scope: "all_active_branches" as const,
          },
        }
      : item);
  const current = await snapshot({ treatments: partialBranchKnowledge });
  const missing = resolveTreatmentFact(current, "future_unloaded", "introduction");
  assert(
    missing.status === "unknown" && missing.reason === "not_in_partial_catalog",
    "CF-T1: partial catalog miss must remain unknown",
  );

  const { ontology } = futureRegistryFixture();
  const explicitMissing = await snapshot({
    notOfferedTreatmentKeys: ["future_device"],
    ontology,
  });
  const notOffered = resolveTreatmentFact(explicitMissing, "future_device", "introduction");
  assert(
    notOffered.status === "not_offered" && notOffered.reason === "explicit_not_offered",
    "CF-T2: only explicit evidence may produce not_offered",
  );

  const onda = resolveTreatmentFact(current, "onda_pro", "introduction");
  assert(onda.status === "offered", "CF-T3: configured treatment must resolve as offered");
  assert(
    onda.branchAvailability.scope === "unknown" && onda.branchAvailability.branchNames.length === 0,
    "CF-T3: omitted branch scope must not become all branches",
  );
  assert(
    onda.profileCompleteness === "complete" && onda.missingFields.length === 0,
    "CF-T4: unrelated branch completeness must not make treatment education conservative",
  );

  const draftKnowledge = treatmentKnowledgeResolver.list().map((item) =>
    item.key === "onda_pro" ? { ...item, approvalStatus: "draft" as const } : item);
  const draftSnapshot = await snapshot({ treatments: draftKnowledge });
  const draft = resolveTreatmentFact(draftSnapshot, "onda_pro", "introduction");
  assert(draft.status === "unknown" && draft.reason === "unreviewed", "CF-T5: draft facts leaked");
  assert(!("facts" in draft), "CF-T5: unreviewed result must not carry customer facts");

  const stale = resolveTreatmentFact(
    await snapshot({ staleTreatmentKeys: ["onda_pro"] }),
    "onda_pro",
    "introduction",
  );
  assert(stale.status === "unknown" && stale.reason === "stale", "CF-T6: stale treatment content leaked");
}

async function validatePriceStateMachine() {
  const current = await snapshot({ pricingCampaigns: [campaign()] });
  const approved = resolveApprovedPrice(current, { kind: "campaign", treatmentKeys: ["onda_pro"] });
  assert(approved.status === "approved_current", "CF-P1: current approved price did not resolve");
  assert(approved.customerPriceText === "體驗價 16,888", "CF-P1: exact approved price changed");
  assert(!/(?:2026|08\/01|08\/31)/u.test(JSON.stringify(approved.customerFacts)), "CF-P1: activity dates leaked");

  const noPrice = resolveApprovedPrice(await snapshot(), { kind: "unspecified", treatmentKeys: ["onda_pro"] });
  assert(noPrice.status === "unavailable_to_quote" && noPrice.reason === "not_provided", "CF-P2: missing price must fail closed");
  assert(!("customerPriceText" in noPrice), "CF-P2: missing price result carried a price field");

  const expired = resolveApprovedPrice(
    await snapshot({ pricingCampaigns: [campaign({ end_date: "2026-07-31" })] }),
    { kind: "campaign", treatmentKeys: ["onda_pro"] },
  );
  assert(expired.status === "unavailable_to_quote" && expired.reason === "expired", "CF-P3: expired price leaked");
  assert(!("customerPriceText" in expired), "CF-P3: expired result carried a price field");

  const future = resolveApprovedPrice(
    await snapshot({ pricingCampaigns: [campaign({ start_date: "2026-09-01", end_date: "2026-09-30" })] }),
    { kind: "campaign", treatmentKeys: ["onda_pro"] },
  );
  assert(future.status === "unavailable_to_quote" && future.reason === "not_yet_effective", "CF-P3: future price leaked");

  const ambiguous = resolveApprovedPrice(
    await snapshot({
      pricingCampaigns: [
        campaign({ id: "price-a", price_text: "16,888" }),
        campaign({ id: "price-b", price_text: "17,888" }),
      ],
    }),
    { kind: "campaign", treatmentKeys: ["onda_pro"] },
  );
  assert(ambiguous.status === "unavailable_to_quote" && ambiguous.reason === "ambiguous", "CF-P4: ambiguous prices must not pick the first row");
  assert(!("customerPriceText" in ambiguous), "CF-P4: ambiguous result carried a price field");

  const outage = resolveApprovedPrice(
    await snapshot({ priceSourceAvailable: false, pricingCampaigns: [campaign()] }),
    { kind: "campaign", treatmentKeys: ["onda_pro"] },
  );
  assert(outage.status === "unavailable_to_quote" && outage.reason === "source_unavailable", "CF-P5: source outage revived fallback price");

  for (const approvalStatus of ["", "pending", "rejected"]) {
    const unreviewed = resolveApprovedPrice(
      await snapshot({ pricingCampaigns: [campaign({ approval_status: approvalStatus })] }),
      { kind: "campaign", treatmentKeys: ["onda_pro"] },
    );
    assert(
      unreviewed.status === "unavailable_to_quote" && unreviewed.reason === "unreviewed",
      `CF-P6: ${approvalStatus || "blank"} approval status leaked a price`,
    );
  }

  const notOfferedInventory = resolveApprovedPrice(
    await snapshot({
      notOfferedTreatmentKeys: ["onda_pro"],
      pricingCampaigns: [campaign()],
    }),
    { kind: "campaign", treatmentKeys: ["onda_pro"] },
  );
  assert(
    notOfferedInventory.status === "unavailable_to_quote" &&
      notOfferedInventory.reason === "treatment_not_offered",
    "CF-P7: price must not override explicit not-offered inventory",
  );

  const draftKnowledge = treatmentKnowledgeResolver.list().map((item) =>
    item.key === "onda_pro" ? { ...item, approvalStatus: "draft" as const } : item);
  const draftInventory = resolveApprovedPrice(
    await snapshot({ pricingCampaigns: [campaign()], treatments: draftKnowledge }),
    { kind: "campaign", treatmentKeys: ["onda_pro"] },
  );
  assert(
    draftInventory.status === "unavailable_to_quote" &&
      draftInventory.reason === "treatment_unconfirmed",
    "CF-P8: unreviewed inventory must block price output",
  );

  const sourceDownInventory = resolveApprovedPrice(
    await snapshot({ pricingCampaigns: [campaign()], treatmentSourceAvailable: false }),
    { kind: "campaign", treatmentKeys: ["onda_pro"] },
  );
  assert(
    sourceDownInventory.status === "unavailable_to_quote" &&
      sourceDownInventory.reason === "treatment_unconfirmed",
    "CF-P9: inventory source failure must block price output",
  );

  const taipeiOpening = resolveApprovedPrice(
    await loadClinicFactsSnapshot(
      createStaticClinicFactsProvider({
        pricingCampaigns: [campaign({ start_date: "2026-08-15", end_date: "2026-08-15" })],
      }),
      { now: new Date("2026-08-14T16:30:00.000Z") },
    ),
    { kind: "campaign", treatmentKeys: ["onda_pro"] },
  );
  assert(taipeiOpening.status === "approved_current", "CF-P10: Taipei first-day boundary used process timezone");

  const { sanitizeCustomerPromotionText } = await import("../src/lib/clinic-facts/price-resolver");
  const sanitized = sanitizeCustomerPromotionText("8月底 12,999元（ONDA Pro超微波6分鐘＋Neuronox肉毒小臉）");
  assert(!sanitized.includes("8月底"), "CF-P11: internal month-end date leaked");
  assert(sanitized.endsWith("）"), "CF-P11: sanitizer broke balanced full-width parentheses");
  assert(!sanitizeCustomerPromotionText("活動到 8 月底 999").includes("月底"), "CF-P11: spaced month-end date leaked");
  assert(!/(?:即日起|月底)/u.test(sanitizeCustomerPromotionText("即日起至本月底 999")), "CF-P11: relative campaign date leaked");
  for (const priceText of [
    "方案只到月底 999",
    "限時到月底 999",
    "2026 年 8 月 31 日 999",
    "優惠僅到週五 999",
    "本週優惠 999",
    "倒數三天 999",
    "週末前 999",
    "暑假限定 999",
    "優惠到8月31號 999",
    "優惠至八月三十一號 999",
    "8月31前 999",
    "夏季限定 999",
  ]) {
    const unsafe = resolveApprovedPrice(
      await snapshot({ pricingCampaigns: [campaign({ price_text: priceText })] }),
      { kind: "campaign", treatmentKeys: ["onda_pro"] },
    );
    assert(
      unsafe.status === "unavailable_to_quote" && unsafe.reason === "unsafe_customer_text",
      `CF-P11: unsafe price text reached customer facts: ${priceText}`,
    );
  }
  for (const approvedText of [
    "12,999元（ONDA Pro超微波6分鐘＋Neuronox肉毒小臉）",
    "DERMAPEN 4 單次 3,999元",
    "HA35 2.5ml 9,999元",
    "十蓓電波200發 9,999元",
    "皮秒3堂 8,888元",
    "約2至4週逐步有感，核准價格 9,999元",
  ]) {
    const safe = resolveApprovedPrice(
      await snapshot({
        pricingCampaigns: [campaign({ customer_price_text: approvedText })],
      }),
      { kind: "campaign", treatmentKeys: ["onda_pro"] },
    );
    assert(
      safe.status === "approved_current" && safe.customerPriceText === approvedText,
      `CF-P11: legitimate treatment number was falsely blocked: ${approvedText}`,
    );
  }

  const [firstBranch, secondBranch] = clinicConfig.branches.filter((branch) => branch.isActive);
  assert(firstBranch && secondBranch, "CF-P14: branch applicability fixture requires two active branches");
  const branchScopedSnapshot = await snapshot({
    pricingCampaigns: [campaign({ branch_scope: firstBranch.name })],
  });
  const branchMissing = resolveApprovedPrice(branchScopedSnapshot, {
    kind: "campaign",
    treatmentKeys: ["onda_pro"],
  });
  assert(
    branchMissing.status === "unavailable_to_quote" && branchMissing.reason === "branch_required",
    "CF-P14: branch-scoped price was quoted without a branch",
  );
  const wrongBranch = resolveApprovedPrice(branchScopedSnapshot, {
    applicability: { branch: secondBranch.name },
    kind: "campaign",
    treatmentKeys: ["onda_pro"],
  });
  assert(
    wrongBranch.status === "unavailable_to_quote" && wrongBranch.reason === "applicability_mismatch",
    "CF-P14: one branch's price was approved for another branch",
  );
  const correctBranch = resolveApprovedPrice(branchScopedSnapshot, {
    applicability: { branch: firstBranch.city },
    kind: "campaign",
    treatmentKeys: ["onda_pro"],
  });
  assert(
    correctBranch.status === "approved_current" &&
      correctBranch.applicability.branch === firstBranch.city,
    "CF-P14: matching branch alias did not resolve the scoped price",
  );

  const dimensionedSnapshot = await snapshot({
    pricingCampaigns: [campaign({
      dose: "200發",
      package_key: "face-lift",
      session_count: 3,
      variant_key: "premium",
    })],
  });
  const dimensionsMissing = resolveApprovedPrice(dimensionedSnapshot, {
    kind: "campaign",
    treatmentKeys: ["onda_pro"],
  });
  assert(
    dimensionsMissing.status === "unavailable_to_quote" &&
      dimensionsMissing.reason === "applicability_required",
    "CF-P15: dimensioned price was quoted without package/variant/dose/session",
  );
  const dimensionsMismatch = resolveApprovedPrice(dimensionedSnapshot, {
    applicability: {
      dose: "300發",
      package: "face-lift",
      sessionCount: 3,
      variant: "premium",
    },
    kind: "campaign",
    treatmentKeys: ["onda_pro"],
  });
  assert(
    dimensionsMismatch.status === "unavailable_to_quote" &&
      dimensionsMismatch.reason === "applicability_mismatch",
    "CF-P15: mismatched dose inherited another variant's price",
  );
  const dimensionsMatch = resolveApprovedPrice(dimensionedSnapshot, {
    applicability: {
      dose: "200發",
      package: "face-lift",
      sessionCount: 3,
      variant: "premium",
    },
    kind: "campaign",
    treatmentKeys: ["onda_pro"],
  });
  assert(
    dimensionsMatch.status === "approved_current" &&
      dimensionsMatch.applicability.sessionCount === 3,
    "CF-P15: exact package/variant/dose/session did not resolve",
  );

  const legacyOnlyText = resolveApprovedPrice(
    await snapshot({
      pricingCampaigns: [campaign({
        customer_price_approval_status: undefined,
        customer_price_text: undefined,
        price_text: "本週優惠 16,888",
      })],
    }),
    { kind: "campaign", treatmentKeys: ["onda_pro"] },
  );
  assert(
    legacyOnlyText.status === "unavailable_to_quote" &&
      legacyOnlyText.reason === "unreviewed",
    "CF-P16: V2 quoted the legacy free-text price field without separate approval",
  );

  const structuredCustomerText = resolveApprovedPrice(
    await snapshot({
      pricingCampaigns: [campaign({
        customer_price_approval_status: "approved",
        customer_price_text: "核准體驗價 16,888",
        price_text: "活動只到 8 月底 16,888",
      })],
    }),
    { kind: "campaign", treatmentKeys: ["onda_pro"] },
  );
  assert(
    structuredCustomerText.status === "approved_current" &&
      structuredCustomerText.customerPriceText === "核准體驗價 16,888" &&
      !structuredCustomerText.customerFacts.join(" ").includes("月底"),
    "CF-P16: approved customer-visible field did not override unsafe legacy free text",
  );
  const unapprovedCustomerText = resolveApprovedPrice(
    await snapshot({
      pricingCampaigns: [campaign({
        customer_price_approval_status: "pending",
        customer_price_text: "體驗價 16,888",
        price_text: "16,888",
      })],
    }),
    { kind: "campaign", treatmentKeys: ["onda_pro"] },
  );
  assert(
    unapprovedCustomerText.status === "unavailable_to_quote" &&
      unapprovedCustomerText.reason === "unreviewed",
    "CF-P16: unapproved customer field fell back to legacy free text",
  );
  const datedCustomerText = resolveApprovedPrice(
    await snapshot({
      pricingCampaigns: [campaign({
        customer_price_approval_status: "approved",
        customer_price_text: "限時到 8 月底 16,888",
        price_text: "16,888",
      })],
    }),
    { kind: "campaign", treatmentKeys: ["onda_pro"] },
  );
  assert(
    datedCustomerText.status === "unavailable_to_quote" &&
      datedCustomerText.reason === "unsafe_customer_text",
    "CF-P16: activity timing leaked from structured customer-visible text",
  );
}

async function validateRealSeedPriceOwnership() {
  const seed = await loadSeedData();
  const current = await snapshot({ pricingCampaigns: seed.pricingCampaigns });
  const onda = resolveApprovedPrice(current, { kind: "unspecified", treatmentKeys: ["onda_pro"] });
  const botox = resolveApprovedPrice(current, { kind: "unspecified", treatmentKeys: ["botox"] });
  const combination = resolveApprovedPrice(current, {
    kind: "campaign",
    treatmentKeys: ["onda_pro", "botox"],
  });
  assert(onda.status === "approved_current" && onda.customerPriceText.includes("16,888"), "CF-P12: real ONDA seed owner failed");
  assert(botox.status === "approved_current" && botox.customerPriceText === "999", "CF-P12: Botox picked combination price");
  assert(combination.status === "approved_current" && combination.customerPriceText.includes("12,999"), "CF-P12: exact combination price failed");

  const afterCombination = await loadClinicFactsSnapshot(
    createStaticClinicFactsProvider({ pricingCampaigns: seed.pricingCampaigns }),
    { now: new Date("2026-09-01T10:00:00+08:00") },
  );
  const expiredCombination = resolveApprovedPrice(afterCombination, {
    kind: "campaign",
    treatmentKeys: ["onda_pro", "botox"],
  });
  assert(
    expiredCombination.status === "unavailable_to_quote" && expiredCombination.reason === "expired",
    "CF-P13: expired combination must not fall back to a single-treatment price",
  );
}

async function validateVersionedUpdatesWithoutPolicyChanges() {
  const v1 = await snapshot({
    pricingCampaigns: [campaign({ price_text: "體驗價 16,888" })],
    snapshotId: "clinic-facts-v1",
  });
  const v2 = await snapshot({
    pricingCampaigns: [campaign({ price_text: "體驗價 18,888" })],
    snapshotId: "clinic-facts-v2",
  });
  const query = { kind: "campaign" as const, treatmentKeys: ["onda_pro"] };
  const first = resolveApprovedPrice(v1, query);
  const updated = resolveApprovedPrice(v2, query);
  const rolledBack = resolveApprovedPrice(v1, query);
  assert(first.status === "approved_current" && first.customerPriceText.includes("16,888"), "CF-I1: v1 price failed");
  assert(updated.status === "approved_current" && updated.customerPriceText.includes("18,888"), "CF-I1: snapshot update required policy changes");
  assert(rolledBack.status === "approved_current" && rolledBack.customerPriceText.includes("16,888"), "CF-I1: snapshot rollback failed");
}

async function validatePriceApplicabilityFlowsThroughV2() {
  const branch = clinicConfig.branches.find((candidate) => candidate.isActive)!;
  const current = await snapshot({
    pricingCampaigns: [campaign({
      branch_scope: branch.name,
      dose: "200發",
      package_key: "face-lift",
      session_count: 3,
      variant_key: "premium",
    })],
  });
  const priceTurn = turn({
    priceApplicability: {
      branch: branch.city,
      dose: "200發",
      package: "face-lift",
      sessionCount: 3,
      variant: "premium",
    },
    questionAspect: "price_campaign",
    speechAct: "ask_price",
    text: `${branch.city}的三堂方案多少錢`,
    treatments: [
      { confidence: 0.95, key: "onda_pro", polarity: "affirmed", resolution: "resolved" },
    ],
    turnId: "price-applicability-turn",
  });
  const initial = createConversationV2State({ episodeId: "price-applicability", now: NOW.toISOString() });
  const routed = routeConversationTurnV2(initial, priceTurn);
  assert(!routed.duplicate && routed.result, "CF-P17: V2 price applicability turn did not route");
  assert(
    routed.result.replyPlan.mode === "deterministic" &&
      routed.result.replyPlan.pricingQuery?.applicability?.sessionCount === 3 &&
      routed.result.replyPlan.pricingQuery.applicability.branch === branch.city,
    "CF-P17: policy dropped structured price applicability",
  );
  const hydrated = await hydrateConversationV2ReplyPlan({
    nextState: routed.nextState,
    result: routed.result,
    snapshot: current,
    turn: priceTurn,
  });
  assert(
    hydrated.priceResolution?.status === "approved_current" &&
      hydrated.rendererPlan?.exactPriceFacts?.some((fact) => fact.includes("16,888")),
    "CF-P17: hydrator did not resolve the dimensioned price query",
  );

  const wrongVariant = turn({
    ...priceTurn,
    priceApplicability: { ...priceTurn.priceApplicability, variant: "standard" },
    turnId: "price-applicability-mismatch-turn",
  });
  const mismatchRoute = routeConversationTurnV2(initial, wrongVariant);
  assert(!mismatchRoute.duplicate && mismatchRoute.result, "CF-P17: mismatch route failed");
  const mismatchHydrated = await hydrateConversationV2ReplyPlan({
    nextState: mismatchRoute.nextState,
    result: mismatchRoute.result,
    snapshot: current,
    turn: wrongVariant,
  });
  assert(
    mismatchHydrated.priceResolution?.status === "unavailable_to_quote" &&
      mismatchHydrated.priceResolution.reason === "applicability_mismatch" &&
      mismatchHydrated.toolRequest?.type === "request_fact_confirmation" &&
      mismatchHydrated.toolRequest.priceApplicability?.variant === "standard",
    "CF-P17: mismatch did not fail closed with exact qualifiers for human confirmation",
  );
}

async function validateSnapshotIntegrityAndRecognitionBoundary() {
  const { config, knowledge, ontology } = futureRegistryFixture();
  const mutableClinic: ClinicConfig = {
    ...config,
    branches: config.branches.map((branch) => ({ ...branch, aliases: [...branch.aliases] })),
  };
  const mutableOntology = buildClinicOntology(mutableClinic);
  const mutableKnowledge = createTreatmentKnowledgeResolver(mutableClinic).list();
  const mutablePrices = [campaign()];
  const mutableFacts = { "fact:one": "approved value" };
  const current = await snapshot({
    approvedFactsById: mutableFacts,
    clinic: mutableClinic,
    ontology: mutableOntology,
    pricingCampaigns: mutablePrices,
    staleTreatmentKeys: ["onda_pro"],
    treatments: mutableKnowledge,
  });

  const originalBranchAlias = current.clinic.branches[0]?.aliases[0];
  const originalOntologyAlias = current.ontology.treatments[0]?.aliases[0];
  const originalKnowledgeAlias = current.treatments[0]?.aliases[0];
  const originalPrice = current.pricingCampaigns[0]?.price_text;
  mutableClinic.branches[0]!.aliases[0] = "MUTATED_BRANCH";
  mutableOntology.treatments[0]!.aliases[0] = "MUTATED_ONTOLOGY";
  mutableKnowledge[0]!.aliases[0] = "MUTATED_KNOWLEDGE";
  mutablePrices[0]!.price_text = "MUTATED_PRICE";
  mutableFacts["fact:one"] = "MUTATED_FACT";

  assert(current.clinic.branches[0]?.aliases[0] === originalBranchAlias, "CF-S1: source clinic mutated a loaded snapshot");
  assert(current.ontology.treatments[0]?.aliases[0] === originalOntologyAlias, "CF-S1: source ontology mutated a loaded snapshot");
  assert(current.treatments[0]?.aliases[0] === originalKnowledgeAlias, "CF-S1: source treatment mutated a loaded snapshot");
  assert(current.pricingCampaigns[0]?.price_text === originalPrice, "CF-S1: source price mutated a loaded snapshot");
  assert(current.approvedFactsById["fact:one"] === "approved value", "CF-S1: source approved fact mutated a loaded snapshot");
  assertThrows(
    () => (current.clinic.branches[0]!.aliases as string[]).push("MUTATED"),
    "CF-S2: nested clinic array remained mutable",
  );
  assertThrows(
    () => (current.treatments[0]!.aliases as string[]).push("MUTATED"),
    "CF-S2: nested treatment array remained mutable",
  );
  assertThrows(
    () => ((current.pricingCampaigns[0] as PricingCampaign).price_text = "MUTATED"),
    "CF-S2: nested price object remained mutable",
  );
  assertThrows(
    () => (current.staleTreatmentKeys as Set<string>).add("botox"),
    "CF-S2: stale inventory set remained mutable",
  );
  assertThrows(
    () => current.asOf.setTime(0),
    "CF-S2: snapshot timestamp remained mutable",
  );

  await assertSnapshotRejects(
    { treatments: knowledge },
    /treatment key is not recognized by ontology: future_device/u,
    "CF-S3: offered inventory outside ontology was accepted",
  );
  await assertSnapshotRejects(
    { staleTreatmentKeys: ["future_device"] },
    /stale treatment key is not recognized by ontology: future_device/u,
    "CF-S3: stale inventory outside ontology was accepted",
  );
  await assertSnapshotRejects(
    { explicitAllBranchTreatmentKeys: ["future_device"] },
    /all-branch treatment key is not recognized by ontology: future_device/u,
    "CF-S3: all-branch inventory outside ontology was accepted",
  );
  await assertSnapshotRejects(
    { notOfferedTreatmentKeys: ["future_device"] },
    /not-offered treatment key is not recognized by ontology: future_device/u,
    "CF-S3: not-offered inventory outside ontology was accepted",
  );

  const recognitionOnly = await snapshot({
    ontology,
    treatments: treatmentKnowledgeResolver.list(),
  });
  const recognitionOnlyFact = resolveTreatmentFact(recognitionOnly, "future_device", "introduction");
  assert(
    recognitionOnlyFact.status === "unknown" && recognitionOnlyFact.reason === "not_in_partial_catalog",
    "CF-S4: ontology-only recognition entry did not remain unknown",
  );
}

async function validateDynamicOntologyUsesTheSameSnapshot() {
  const { config: futureConfig, knowledge, ontology } = futureRegistryFixture();
  const dynamicSnapshot = await snapshot({
    clinic: futureConfig,
    ontology,
    snapshotId: "clinic-facts-with-future-device",
    treatments: knowledge,
  });
  const frame = futureNluFrame();
  assert(buildNluInstructions(dynamicSnapshot.ontology).includes("future_device"), "CF-I2: dynamic NLU prompt missed new treatment");
  assert(JSON.stringify(buildNluResponseFormat(dynamicSnapshot.ontology)).includes("future_device"), "CF-I2: dynamic NLU schema missed new treatment");
  assert(parseNluFrame(frame, dynamicSnapshot.ontology)?.treatments[0] === "future_device", "CF-I2: dynamic frame parser rejected new treatment");
  const adapted = adaptNluFrameToConversationV2Turn({
    frame,
    ontology: dynamicSnapshot.ontology,
    receivedAt: NOW.toISOString(),
    text: "想了解未來儀器",
    turnId: "future-turn",
  });
  assert(adapted.treatments[0]?.key === "future_device", "CF-I2: V2 adapter rejected snapshot treatment");
  const fact = resolveTreatmentFact(dynamicSnapshot, "future_device", "introduction");
  assert(fact.status === "offered" && fact.facts.some((item) => item.includes("核准介紹")), "CF-I2: fact resolver missed snapshot treatment");
}

async function validateRecognitionRegistryAndInventoryAreIndependent() {
  const { ontology } = futureRegistryFixture();
  const recognitionOnly = await snapshot({
    ontology,
    snapshotId: "clinic-facts-recognition-only",
    treatments: treatmentKnowledgeResolver.list(),
  });
  const parsed = parseNluFrame(futureNluFrame(), recognitionOnly.ontology);
  assert(parsed, "CF-I3: recognition registry rejected a known external treatment name");
  const adapted = adaptNluFrameToConversationV2Turn({
    frame: parsed,
    ontology: recognitionOnly.ontology,
    receivedAt: NOW.toISOString(),
    text: "想了解未來儀器",
    turnId: "registry-only-turn",
  });
  const initial = createConversationV2State({ episodeId: "registry-only", now: NOW.toISOString() });
  const routed = routeConversationTurnV2(initial, adapted);
  assert(!routed.duplicate && routed.result, "CF-I3: recognition-only treatment did not route");
  const hydrated = await hydrateConversationV2ReplyPlan({
    nextState: routed.nextState,
    result: routed.result,
    snapshot: recognitionOnly,
    turn: adapted,
  });
  assert(hydrated.dataStatus === "unresolved", "CF-I3: missing inventory was treated as offered");
  assert(hydrated.rendererPlan?.renderMode === "deterministic", "CF-I3: missing inventory reached free generation");
  assert(hydrated.toolRequest?.type === "request_fact_confirmation", "CF-I3: unknown inventory did not request confirmation");

  const explicitlyUnavailable = await snapshot({
    notOfferedTreatmentKeys: ["future_device"],
    ontology,
    snapshotId: "clinic-facts-explicit-not-offered",
    treatments: treatmentKnowledgeResolver.list(),
  });
  const explicitHydrated = await hydrateConversationV2ReplyPlan({
    nextState: routed.nextState,
    result: routed.result,
    snapshot: explicitlyUnavailable,
    turn: adapted,
  });
  assert(explicitHydrated.rendererPlan?.fallbackText.includes("沒有提供"), "CF-I3: explicit not-offered evidence was not explained");
  assert(!explicitHydrated.toolRequest, "CF-I3: known not-offered item created redundant fact-confirmation work");

  const comparisonFrame = futureNluFrame({
    dialogue: {
      focus: "general_difference",
      move: "compare",
      reference: "explicit",
      speechAct: "compare_treatments",
    },
    treatments: ["onda_pro", "future_device"],
  });
  const comparison = adaptNluFrameToConversationV2Turn({
    frame: parseNluFrame(comparisonFrame, recognitionOnly.ontology),
    ontology: recognitionOnly.ontology,
    receivedAt: NOW.toISOString(),
    text: "ONDA 跟未來儀器差在哪",
    turnId: "partial-comparison",
  });
  const comparisonRoute = routeConversationTurnV2(initial, comparison);
  assert(!comparisonRoute.duplicate && comparisonRoute.result, "CF-I3: partial comparison did not route");
  const comparisonHydrated = await hydrateConversationV2ReplyPlan({
    nextState: comparisonRoute.nextState,
    result: comparisonRoute.result,
    snapshot: recognitionOnly,
    turn: comparison,
  });
  assert(comparisonHydrated.rendererPlan?.renderMode === "deterministic", "CF-I3: one-sided comparison reached generation");
  assert(comparisonHydrated.toolRequest?.type === "request_fact_confirmation", "CF-I3: missing comparison side was silently dropped");
}

async function validateSnapshotKnowledgeIsolation() {
  const snapshotKnowledge = treatmentKnowledgeResolver.list().map((item) =>
    item.key === "onda_pro"
      ? {
          ...item,
          approvedIntroReplies: ["SNAPSHOT_V2_ONLY"],
          comfort: null,
          downtime: null,
          evaluationNote: "SNAPSHOT_EVALUATION_ONLY",
          expectedDirections: [],
          mechanismInPlainLanguage: "SNAPSHOT_V2_ONLY",
        }
      : item);
  const current = await snapshot({
    snapshotId: "clinic-facts-snapshot-isolation",
    treatments: snapshotKnowledge,
  });
  const initial = createConversationV2State({ episodeId: "snapshot-isolation", now: NOW.toISOString() });
  const treatmentTurn = turn({
    treatments: [{ confidence: 0.95, key: "onda_pro", polarity: "affirmed", resolution: "resolved" }],
    turnId: "snapshot-isolation-turn",
  });
  const routed = routeConversationTurnV2(initial, treatmentTurn);
  assert(!routed.duplicate && routed.result, "CF-I4: snapshot isolation route failed");
  const hydrated = await hydrateConversationV2ReplyPlan({
    nextState: routed.nextState,
    result: routed.result,
    snapshot: current,
    turn: treatmentTurn,
  });
  assert(hydrated.rendererPlan, "CF-I4: snapshot isolation did not produce a renderer plan");
  const approvedKnowledge = buildApprovedKnowledge(hydrated.rendererPlan);
  assert(approvedKnowledge.includes("SNAPSHOT_V2_ONLY"), "CF-I4: snapshot knowledge was lost");
  assert(!approvedKnowledge.includes("Coolwaves"), "CF-I4: global legacy treatment knowledge leaked into snapshot plan");

  let generatorKnowledge = "";
  await renderReplyPlan({
    customerMessage: "想了解 ONDA",
    dialogueState: rendererDialogueState(),
    generator: async (_message, context) => {
      generatorKnowledge = context.approvedKnowledge ?? "";
      return null;
    },
    includeFooter: false,
    plan: hydrated.rendererPlan,
    recentTurns: [],
  });
  assert(generatorKnowledge.includes("SNAPSHOT_V2_ONLY"), "CF-I4: renderer did not receive snapshot facts");
  assert(!generatorKnowledge.includes("Coolwaves"), "CF-I4: renderer reloaded legacy global knowledge");
}

async function validateClinicCompletenessAndExcludedRecommendations() {
  const firstBranch = clinicConfig.branches.find((branch) => branch.isActive)!;
  const incompleteClinic: ClinicConfig = {
    ...clinicConfig,
    branches: clinicConfig.branches.map((branch) =>
      branch.name === firstBranch.name
        ? { ...branch, businessHours: "待確認", hasCompleteBusinessHours: false }
        : branch),
  };
  const incompleteSnapshot = await snapshot({ clinic: incompleteClinic });
  const hours = resolveClinicInfo(incompleteSnapshot, {
    message: `${firstBranch.name}營業時間`,
    topic: "hours",
  });
  assert(hours.status === "unknown" && hours.reason === "incomplete", "CF-C1: incomplete hours were presented as complete");

  const current = await snapshot();
  const recommendations = resolveTreatmentKnowledge(current, {
    excludedTreatmentKeys: ["onda_pro"],
    mode: "followup",
    query: {
      approvedFactIds: [],
      areaKeys: [],
      concernKeys: ["jawline_looseness"],
      treatmentKeys: [],
    },
  });
  assert(!recommendations.resolvedTreatmentKeys.includes("onda_pro"), "CF-I5: excluded treatment returned as an alternative");
}

async function validateHydrationAndNonBlockingEffects() {
  const initial = createConversationV2State({ episodeId: "episode-facts", now: NOW.toISOString() });
  const { ontology } = futureRegistryFixture();
  const recognitionOnly = await snapshot({
    ontology,
    snapshotId: "clinic-facts-booking-registry-only",
    treatments: treatmentKnowledgeResolver.list(),
  });
  const bookingFrame = futureNluFrame({
    dialogue: {
      focus: "overview",
      move: "start",
      reference: "explicit",
      speechAct: "book_consultation",
    },
    intents: ["booking", "treatment"],
  });
  const unknownTurn = adaptNluFrameToConversationV2Turn({
    frame: parseNluFrame(bookingFrame, recognitionOnly.ontology),
    ontology: recognitionOnly.ontology,
    receivedAt: NOW.toISOString(),
    supplemental: {
      booking: {
        explicit: true,
        fields: { treatmentKeys: ["future_device"] },
        intent: "create",
      },
    },
    text: "我要預約未來儀器",
    turnId: "unknown-treatment-booking",
  });
  const unknownRoute = routeConversationTurnV2(initial, unknownTurn);
  assert(!unknownRoute.duplicate && unknownRoute.result, "CF-I4: unknown treatment route failed");
  const beforeHydration = JSON.stringify(unknownRoute.nextState);
  const hydratedUnknown = await hydrateConversationV2ReplyPlan({
    nextState: unknownRoute.nextState,
    result: unknownRoute.result,
    snapshot: recognitionOnly,
    turn: unknownTurn,
  });
  assert(hydratedUnknown.dataStatus === "unresolved", "CF-I4: data gap did not fail closed");
  assert(hydratedUnknown.toolRequest?.type === "request_fact_confirmation", "CF-I4: data gap did not produce a nonblocking confirmation request");
  assert(hydratedUnknown.stateCommit === "hold", "CF-I4: unknown booking was allowed to commit canonical state");
  assert(!/(?:請留下|哪個館別|3 個方便)/u.test(hydratedUnknown.rendererPlan?.fallbackText ?? ""), "CF-I4: unknown booking started collecting personal data");
  assert(unknownRoute.nextState.control.mode === "ai_active", "CF-I4: data gap incorrectly paused AI");
  assert(JSON.stringify(unknownRoute.nextState) === beforeHydration, "CF-I4: hydration mutated canonical state");

  const notOfferedSnapshot = await snapshot({
    notOfferedTreatmentKeys: ["future_device"],
    ontology,
    treatments: treatmentKnowledgeResolver.list(),
  });
  const hydratedNotOfferedBooking = await hydrateConversationV2ReplyPlan({
    nextState: unknownRoute.nextState,
    result: unknownRoute.result,
    snapshot: notOfferedSnapshot,
    turn: unknownTurn,
  });
  assert(hydratedNotOfferedBooking.stateCommit === "hold", "CF-I4: not-offered booking was allowed to commit");
  assert(!hydratedNotOfferedBooking.toolRequest, "CF-I4: explicit not-offered booking created redundant confirmation work");

  const bookingTurn = turn({
    booking: { explicit: true, intent: "create" },
    speechAct: "book_consultation",
    treatments: [{ confidence: 0.95, key: "onda_pro", polarity: "affirmed", resolution: "resolved" }],
    turnId: "booking-turn",
  });
  const bookingRoute = routeConversationTurnV2(initial, bookingTurn);
  assert(!bookingRoute.duplicate && bookingRoute.result, "CF-B1: booking route failed");
  const hydratedBooking = await hydrateConversationV2ReplyPlan({
    nextState: bookingRoute.nextState,
    result: bookingRoute.result,
    snapshot: await snapshot(),
    turn: bookingTurn,
  });
  assert(hydratedBooking.toolRequest?.type === "persist_booking_progress", "CF-B1: booking did not produce one typed effect");
  assert(hydratedBooking.stateCommit === "commit", "CF-B1: approved booking was not committable");
  assert(hydratedBooking.rendererPlan?.fallbackText.includes("館別"), "CF-B1: booking did not ask only the next missing field");

  const handoffTurn = turn({ speechAct: "request_handoff", turnId: "handoff-turn" });
  const handoffRoute = routeConversationTurnV2(bookingRoute.nextState, handoffTurn);
  assert(!handoffRoute.duplicate && handoffRoute.result, "CF-H1: handoff route failed");
  const hydratedHandoff = await hydrateConversationV2ReplyPlan({
    nextState: handoffRoute.nextState,
    result: handoffRoute.result,
    snapshot: await snapshot(),
    turn: handoffTurn,
  });
  assert(hydratedHandoff.toolRequest?.type === "queue_handoff", "CF-H1: handoff reason/effect was lost");
  assert(handoffRoute.nextState.bookingTask.draft.treatmentKeys.includes("onda_pro"), "CF-H1: handoff discarded the booking draft");
  assert(handoffRoute.nextState.control.mode === "handoff_pending", "CF-H1: canonical control did not enter handoff_pending");
  assert(handoffRoute.result.action.type === "queue_handoff", "CF-H1: policy action lost handoff semantics");
  assert(
    hydratedHandoff.toolRequest?.type === "queue_handoff" &&
      hydratedHandoff.toolRequest.handoffId === handoffRoute.result.action.handoffId &&
      hydratedHandoff.toolRequest.reason === handoffRoute.result.action.reason,
    "CF-H1: handoff id/reason was not preserved",
  );
  assert(hydratedHandoff.rendererPlan?.requiresHuman === true, "CF-H1: renderer plan lost human handoff requirement");
}

async function main() {
  await validateTreatmentTriStateAndPartialProfiles();
  await validatePriceStateMachine();
  await validateRealSeedPriceOwnership();
  await validateVersionedUpdatesWithoutPolicyChanges();
  await validatePriceApplicabilityFlowsThroughV2();
  await validateSnapshotIntegrityAndRecognitionBoundary();
  await validateDynamicOntologyUsesTheSameSnapshot();
  await validateRecognitionRegistryAndInventoryAreIndependent();
  await validateSnapshotKnowledgeIsolation();
  await validateClinicCompletenessAndExcludedRecommendations();
  await validateHydrationAndNonBlockingEffects();
  console.log("Conversation V2 clinic facts validation passed: immutable snapshots, ontology-bound inventory, partial catalogs, pricing, hydration, and typed effects");
}

main().catch((error) => {
  console.error("FAIL:", error);
  process.exitCode = 1;
});
