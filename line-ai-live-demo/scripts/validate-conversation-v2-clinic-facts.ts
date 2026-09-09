import {
  clinicConfig,
  type ClinicConfig,
  type TreatmentConfig,
} from "../src/lib/clinic-config";
import { buildClinicOntology } from "../src/lib/clinic-ontology";
import type { DialogueState } from "../src/lib/dialogue-state";
import {
  approvedPromotionCatalogSelectionText,
  createStaticClinicFactsProvider,
  loadClinicFactsSnapshot,
  resolveApprovedPromotionCatalog,
  resolveApprovedPromotionCatalogSelection,
  resolveApprovedPrice,
  resolveClinicInfo,
  resolveTreatmentFact,
  resolveTreatmentKnowledge,
  type PriceCatalogEntry,
} from "../src/lib/clinic-facts";
import { buildTreatmentReplyAssets } from "../src/lib/clinic-facts/treatment-reply-assets";
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
  ANNIVERSARY_ONLINE_PUBLIC_PROMOTION_IDS,
  isCustomerVisiblePriceOffer,
} from "../src/lib/pricing-lifecycle";
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
        label: "未來困擾",
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
    onda.branchAvailability.scope === "all" &&
      onda.branchAvailability.branchNames.length === clinicConfig.branches.filter((branch) => branch.isActive).length &&
      onda.customerIntroReplies.some((reply) => reply === "ONDA PRO目前四館皆有提供。"),
    "CF-T3: a treatment without an explicit exception must use the compact all-branch customer copy",
  );
  assert(
    onda.profileCompleteness === "complete" && onda.missingFields.length === 0,
    "CF-T4: unrelated branch completeness must not make treatment education conservative",
  );

  const emface = resolveTreatmentFact(current, "emface", "introduction");
  assert(
    emface.status === "offered" &&
      emface.branchAvailability.scope === "selected" &&
      JSON.stringify(emface.branchAvailability.branchNames) === JSON.stringify(["台中館"]) &&
      emface.customerIntroReplies.some((reply) => reply === "EMFACE目前僅台中館提供。"),
    "CF-T4: an explicit treatment branch exception must stay selected and customer visible",
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

async function validateUnmodeledTreatmentAspectsFailClosed() {
  // Use the real static treatment snapshot.  In particular, do not erase
  // mechanismInPlainLanguage or expectedDirections: those populated fields are
  // the regression condition that previously hid these aspect-specific gaps.
  const current = await snapshot();
  const aspectCases: Array<{
    aspect: "side_effects" | "duration" | "sessions";
    text: string;
  }> = [
    { aspect: "side_effects", text: "ONDA 有什麼副作用" },
    { aspect: "duration", text: "ONDA 一次療程要多久" },
    { aspect: "sessions", text: "ONDA 通常要做幾次" },
  ];

  for (const { aspect, text } of aspectCases) {
    const detailTurn = turn({
      questionAspect: aspect,
      speechAct: "ask_treatment_detail",
      text,
      treatments: [
        { confidence: 0.95, key: "onda_pro", polarity: "affirmed", resolution: "resolved" },
      ],
      turnId: `unmodeled-aspect-${aspect}`,
    });
    const initial = createConversationV2State({
      episodeId: `unmodeled-aspect-${aspect}`,
      now: NOW.toISOString(),
    });
    const routed = routeConversationTurnV2(initial, detailTurn);
    assert(!routed.duplicate && routed.result, `CF-T7 ${aspect}: detail turn did not route`);
    const hydrated = await hydrateConversationV2ReplyPlan({
      nextState: routed.nextState,
      result: routed.result,
      snapshot: current,
      turn: detailTurn,
    });
    assert(
      hydrated.treatmentResolution?.requestedDataGaps.some(
        (gap) => gap.treatmentKey === "onda_pro" && gap.fields.includes(aspect),
      ),
      `CF-T7 ${aspect}: populated general facts incorrectly satisfied an unmodeled aspect`,
    );
    assert(
      hydrated.toolRequest?.type === "request_fact_confirmation" &&
        hydrated.toolRequest.reason.includes(aspect),
      `CF-T7 ${aspect}: unmodeled aspect did not request fact confirmation`,
    );
    assert(
      hydrated.treatmentResolution?.customerAspectReplies.length === 0,
      `CF-T7 ${aspect}: an unrelated approved brand reply leaked into another aspect`,
    );
  }

  const brandsTurn = turn({
    questionAspect: "brands",
    speechAct: "ask_treatment_detail",
    text: "肉毒有哪些品牌",
    treatments: [
      { confidence: 0.95, key: "botox", polarity: "affirmed", resolution: "resolved" },
    ],
    turnId: "modeled-aspect-brands",
  });
  const brandsInitial = createConversationV2State({
    episodeId: "modeled-aspect-brands",
    now: NOW.toISOString(),
  });
  const brandsRoute = routeConversationTurnV2(brandsInitial, brandsTurn);
  assert(!brandsRoute.duplicate && brandsRoute.result, "CF-T8 brands: detail turn did not route");
  const hydratedBrands = await hydrateConversationV2ReplyPlan({
    nextState: brandsRoute.nextState,
    result: brandsRoute.result,
    snapshot: current,
    turn: brandsTurn,
  });
  assert(
    hydratedBrands.treatmentResolution?.requestedDataGaps.length === 0,
    "CF-T8 brands: modeled static brand facts regressed into a data gap",
  );
  assert(!hydratedBrands.toolRequest, "CF-T8 brands: modeled brand facts requested human confirmation");
  assert(
    hydratedBrands.treatmentResolution?.customerAspectReplies.some((reply) =>
      /奇蹟肉毒/u.test(reply) && /經典肉毒/u.test(reply) && /皇家肉毒/u.test(reply)),
    "CF-T8 brands: approved customer-visible brand copy was not resolved",
  );
  assert(
    /奇蹟肉毒/u.test(hydratedBrands.rendererPlan?.fallbackText ?? "") &&
      /經典肉毒/u.test(hydratedBrands.rendererPlan?.fallbackText ?? "") &&
      /皇家肉毒/u.test(hydratedBrands.rendererPlan?.fallbackText ?? ""),
    "CF-T8 brands: approved brand copy did not reach the final customer fallback",
  );
}

async function validatePriceStateMachine() {
  const current = await snapshot({ pricingCampaigns: [campaign()] });
  const approved = resolveApprovedPrice(current, { kind: "campaign", treatmentKeys: ["onda_pro"] });
  assert(approved.status === "approved_current", "CF-P1: current approved price did not resolve");
  assert(approved.customerPriceText === "體驗價 16,888", "CF-P1: exact approved price changed");
  assert(!/(?:2026|08\/01|08\/31)/u.test(JSON.stringify(approved.customerFacts)), "CF-P1: activity dates leaked");

  const regularWording = resolveApprovedPrice(current, { kind: "regular", treatmentKeys: ["onda_pro"] });
  assert(
    regularWording.status === "approved_current" && regularWording.customerPriceText === "體驗價 16,888",
    "CF-P1a: regular/original-price wording must still return the current approved offer",
  );

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

  const prioritized = resolveApprovedPrice(
    await snapshot({
      pricingCampaigns: [
        campaign({ id: "price-priority-low", price_text: "體驗價 16,888", quote_priority: 10 }),
        campaign({ id: "price-priority-high", price_text: "活動價 8,999", quote_priority: 100 }),
      ],
    }),
    { kind: "campaign", treatmentKeys: ["onda_pro"] },
  );
  assert(
    prioritized.status === "approved_current" &&
      prioritized.campaignId === "price-priority-high" &&
      prioritized.customerPriceText === "活動價 8,999",
    "CF-P4a: the highest clinic-approved generic quote priority must own an otherwise ambiguous price question",
  );

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

  const emfaceSnapshot = await snapshot({
    pricingCampaigns: [campaign({
      branch_scope: "all",
      campaign_aliases: "EMFACE|菲斯波",
      campaign_name: "EMFACE 常態核准報價",
      customer_price_text: "EMFACE 目前院內核准參考為 19,999 元。",
      end_date: "",
      id: "standing-emface-19999",
      price_text: "19,999 元",
      pricing_kind: "standing",
      start_date: "",
      treatment_name: "EMFACE",
    })],
  });
  for (const treatmentKey of ["emface", "fisbo"]) {
    const publicPrice = resolveApprovedPrice(emfaceSnapshot, {
      kind: "unspecified",
      treatmentKeys: [treatmentKey],
    });
    assert(
      publicPrice.status === "approved_current" &&
        publicPrice.customerPriceText.includes("19,999") &&
        publicPrice.customerFacts.some((fact) => fact.includes("EMFACE目前僅台中館提供")) &&
        publicPrice.customerFacts.every((fact) => !fact.includes("全館適用")) &&
        publicPrice.treatmentKeys.length === 1 &&
        publicPrice.treatmentKeys[0] === "emface",
      `CF-P17: ${treatmentKey} must use the canonical public EMFACE price owner without a branch`,
    );
    const kaohsiung = resolveApprovedPrice(emfaceSnapshot, {
      applicability: { branch: "高雄館" },
      kind: "unspecified",
      treatmentKeys: [treatmentKey],
    });
    assert(
      kaohsiung.status === "approved_current" && kaohsiung.customerPriceText.includes("19,999"),
      `CF-P17: ${treatmentKey} public price must remain visible to a Kaohsiung customer`,
    );
  }
  const noBranchEmface = resolveApprovedPrice(emfaceSnapshot, {
    kind: "unspecified",
    treatmentKeys: ["emface"],
  });
  assert(
    noBranchEmface.status === "approved_current" && noBranchEmface.customerPriceText.includes("19,999"),
    "CF-P17: the shared official LINE must quote a unified standing price without inferring a branch",
  );

  const unrelatedLegacyKey = resolveApprovedPrice(
    await snapshot({
      pricingCampaigns: [campaign({
        campaign_aliases: "熊貓針|雙美膠原蛋白",
        campaign_name: "熊貓針指定規格",
        customer_price_text: "熊貓針指定規格 99,999 元",
        id: "fixture-panda-specific",
        price_text: "99,999 元",
        treatment_name: "熊貓針",
      })],
    }),
    { kind: "unspecified", treatmentKeys: ["sunmax_collagen_brand"] },
  );
  assert(
    unrelatedLegacyKey.status === "unavailable_to_quote" && unrelatedLegacyKey.reason === "not_provided",
    "CF-P17: pricing-only Fisbo compatibility must not normalize another legacy treatment key",
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
  assert(
    botox.status === "approved_current" &&
      /肉毒體驗價\s*999/u.test(botox.customerPriceText) &&
      !/(?:12\s*U|奇蹟肉毒|經典肉毒|皇家肉毒|Neuronox|BOTOX|Dysport)/iu.test(botox.customerPriceText),
    "CF-P12: generic Botox pricing must use the approved customer-safe offer without brand or dose",
  );
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

async function validateAnniversaryApprovedCatalog() {
  const seed = await loadSeedData();
  const anniversaryRows = seed.pricingCampaigns.filter((item) => item.id.startsWith("promo-2026-anniv-"));
  assert(anniversaryRows.length === 19, `CF-P19: expected 19 anniversary campaigns, got ${anniversaryRows.length}`);
  assert(
    anniversaryRows.every((item) =>
      item.approval_status === "approved" &&
      item.customer_price_approval_status === "approved" &&
      item.branch_scope === "all" &&
      item.start_date === "2026-09-01" &&
      item.end_date === "2026-11-30"),
    "CF-P19: anniversary campaign approval, branch, or internal validity metadata is incomplete",
  );

  const current = await loadClinicFactsSnapshot(
    createStaticClinicFactsProvider({ pricingCampaigns: seed.pricingCampaigns }),
    { now: new Date("2026-09-02T10:00:00+08:00") },
  );
  const publicAnniversaryCount = (facts: typeof current) => {
    const resolved = resolveApprovedPromotionCatalog(facts);
    return resolved.status === "approved_current"
      ? resolved.items.filter((item) => item.campaignId.startsWith("promo-2026-anniv-")).length
      : 0;
  };
  const beforeAnniversary = await loadClinicFactsSnapshot(
    createStaticClinicFactsProvider({ pricingCampaigns: seed.pricingCampaigns }),
    { now: new Date("2026-08-31T23:59:59+08:00") },
  );
  const anniversaryStart = await loadClinicFactsSnapshot(
    createStaticClinicFactsProvider({ pricingCampaigns: seed.pricingCampaigns }),
    { now: new Date("2026-09-01T00:00:00+08:00") },
  );
  const anniversaryLastMoment = await loadClinicFactsSnapshot(
    createStaticClinicFactsProvider({ pricingCampaigns: seed.pricingCampaigns }),
    { now: new Date("2026-11-30T23:59:59+08:00") },
  );
  assert(publicAnniversaryCount(beforeAnniversary) === 0, "CF-P19: anniversary offers must not be public before 2026-09-01 Taiwan time");
  assert(publicAnniversaryCount(anniversaryStart) === 11, "CF-P19: all online anniversary offers must become public at the Taiwan start boundary");
  assert(publicAnniversaryCount(anniversaryLastMoment) === 11, "CF-P19: all online anniversary offers must remain public through the final Taiwan day");

  const withdrawnPublicCampaigns = seed.pricingCampaigns.map((campaign) =>
    campaign.id === "promo-2026-anniv-qplus-200" ? { ...campaign, is_active: "false" } : campaign,
  );
  const partiallyWithdrawn = await loadClinicFactsSnapshot(
    createStaticClinicFactsProvider({ pricingCampaigns: withdrawnPublicCampaigns }),
    { now: new Date("2026-09-02T10:00:00+08:00") },
  );
  assert(publicAnniversaryCount(partiallyWithdrawn) === 10, "CF-P19: withdrawing one public offer must dynamically reduce the catalog");

  const unknownAnniversaryCampaigns = [
    ...seed.pricingCampaigns,
    { ...seed.pricingCampaigns.find((campaign) => campaign.id === "promo-2026-anniv-qplus-200")!, id: "promo-2026-anniv-unknown" },
  ];
  const unknownAnniversary = await loadClinicFactsSnapshot(
    createStaticClinicFactsProvider({ pricingCampaigns: unknownAnniversaryCampaigns }),
    { now: new Date("2026-09-02T10:00:00+08:00") },
  );
  assert(publicAnniversaryCount(unknownAnniversary) === 11, "CF-P19: an unknown anniversary offer must fail closed instead of entering the catalog");
  const catalog = resolveApprovedPromotionCatalog(current);
  assert(catalog.status === "approved_current", "CF-P19: approved anniversary catalog did not resolve");
  if (catalog.status === "approved_current") {
    const expectedCampaignIds = anniversaryRows
      .filter(isCustomerVisiblePriceOffer)
      .map((item) => item.id)
      .sort();
    const actualCampaignIds = catalog.items.map((item) => item.campaignId).sort();
    assert(
      JSON.stringify(actualCampaignIds) === JSON.stringify(expectedCampaignIds),
      `CF-P19: promotion catalog must expose only the current online-public anniversary offers; got ${actualCampaignIds.length}`,
    );
    assert(
      catalog.items.length === ANNIVERSARY_ONLINE_PUBLIC_PROMOTION_IDS.size &&
        catalog.items.every((item) => item.customerAssetUrls.length > 0),
      "CF-P19: only current online-public anniversary offers with their existing artwork may reach customers",
    );
    const customerCatalogText = catalog.items
      .map((item) => `${item.displayName}\n${item.customerPriceText}\n${item.branchScope ?? ""}`)
      .join("\n");
    assert(
      /Q\+\s*音波/u.test(customerCatalogText) &&
        /皮秒|探索皮秒/u.test(customerCatalogText) &&
        /十蓓電波/u.test(customerCatalogText) &&
        /微針超音導賦活粉光瓶/u.test(customerCatalogText),
      "CF-P19: the catalog must not collapse back to only ONDA and Botox",
    );
    assert(
      !/(?:16,888|2026|9\s*月|11\s*月|截止|到期|有效期間)/u.test(customerCatalogText),
      "CF-P19: the catalog leaked a superseded price or internal campaign timing",
    );
    assert(
      customerCatalogText.includes("美國音波 2.0＋肉毒"),
      "CF-P19: combination cards must name every treatment and preserve product versions",
    );
    const actionTexts = new Set<string>();
    for (const item of catalog.items) {
      const actionText = approvedPromotionCatalogSelectionText(item);
      assert(!actionTexts.has(actionText), `CF-P19: duplicate campaign action text for ${item.campaignId}`);
      actionTexts.add(actionText);
      const selection = resolveApprovedPromotionCatalogSelection(current, actionText);
      assert(
        selection?.campaignId === item.campaignId &&
          JSON.stringify(selection.treatmentKeys) === JSON.stringify(item.treatmentKeys),
        `CF-P19: campaign card ${item.campaignId} did not preserve its exact approved identity`,
      );

      const selectedTurn = turn({
        priceApplicability: selection?.applicability,
        priceSelection: selection ? {
          ...selection,
          source: "approved_catalog_action",
        } : undefined,
        questionAspect: "price_campaign",
        speechAct: "ask_price",
        text: actionText,
        treatments: [],
        turnId: `catalog-selection-${item.campaignId}`,
      });
      const selectedRoute = routeConversationTurnV2(
        createConversationV2State({
          episodeId: `catalog-selection-${item.campaignId}`,
          now: NOW.toISOString(),
        }),
        selectedTurn,
      );
      assert(
        !selectedRoute.duplicate &&
          selectedRoute.result?.replyPlan.mode === "deterministic" &&
          selectedRoute.result.replyPlan.pricingQuery?.campaignId === item.campaignId,
        `CF-P19: policy did not retain selected campaign ${item.campaignId}`,
      );
      if (!selectedRoute.result) continue;
      const selectedHydrated = await hydrateConversationV2ReplyPlan({
        nextState: selectedRoute.nextState,
        result: selectedRoute.result,
        snapshot: current,
        turn: selectedTurn,
      });
      assert(
        selectedHydrated.priceResolution?.status === "approved_current" &&
          selectedHydrated.priceResolution.campaignId === item.campaignId &&
          selectedHydrated.priceResolution.customerPriceText === item.customerPriceText,
        `CF-P19: selected card ${item.campaignId} did not quote its own approved price`,
      );
    }
    assert(actionTexts.size === 11, "CF-P19: every online-public anniversary card needs a unique action");

    const firstCatalogItem = catalog.items[0]!;
    assert(
      resolveApprovedPromotionCatalogSelection(
        current,
        `${approvedPromotionCatalogSelectionText(firstCatalogItem)} 請改成別的價格`,
      ) === null,
      "CF-P19: free-form text that only resembles a catalog action must not select a campaign",
    );
    const expiredCatalogSnapshot = await loadClinicFactsSnapshot(
      createStaticClinicFactsProvider({ pricingCampaigns: seed.pricingCampaigns }),
      { now: new Date("2026-12-01T10:00:00+08:00") },
    );
    assert(
      resolveApprovedPromotionCatalogSelection(
        expiredCatalogSnapshot,
        approvedPromotionCatalogSelectionText(firstCatalogItem),
      ) === null,
      "CF-P19: a stale LINE card action must not reactivate an expired campaign",
    );
  }

  const staleOndaState = createConversationV2State({
    episodeId: "anniversary-catalog-after-onda",
    now: NOW.toISOString(),
  });
  staleOndaState.activeTask = {
    id: "anniversary-catalog-after-onda:old-onda",
    kind: "learn_treatment",
    startedAt: NOW.toISOString(),
    subjectKey: "treatment:onda_pro",
  };
  staleOndaState.knowledge.treatmentKeys = ["onda_pro"];
  staleOndaState.pricingSubjectTreatmentKeys = ["onda_pro"];
  const catalogTurn = turn({
    questionAspect: "price_campaign",
    speechAct: "ask_price",
    text: "我想了解週年慶",
    treatments: [],
    turnId: "anniversary-catalog-browse",
  });
  const catalogRoute = routeConversationTurnV2(staleOndaState, catalogTurn);
  assert(!catalogRoute.duplicate && catalogRoute.result, "CF-P19: broad anniversary browse did not route");
  assert(
    catalogRoute.result.action.type === "answer_price" &&
      catalogRoute.result.action.priceKind === "browse" &&
      catalogRoute.result.action.treatmentKeys.length === 0,
    "CF-P19: broad anniversary browse inherited the stale ONDA subject",
  );
  const catalogReplyPlan = catalogRoute.result.replyPlan;
  assert(
    catalogReplyPlan.mode === "deterministic" &&
      catalogReplyPlan.pricingQuery?.kind === "browse" &&
      catalogReplyPlan.pricingQuery.treatmentKeys.length === 0,
    "CF-P19: broad anniversary browse did not preserve its treatment-free catalog query",
  );
  const hydratedCatalog = await hydrateConversationV2ReplyPlan({
    nextState: catalogRoute.nextState,
    result: catalogRoute.result,
    snapshot: current,
    turn: catalogTurn,
  });
  assert(
    hydratedCatalog.promotionCatalogResolution?.status === "approved_current" &&
      hydratedCatalog.promotionCatalogResolution.items.length === 11,
    "CF-P19: V2 hydration did not retain the online-public anniversary catalog",
  );
  const catalogMessages = hydratedCatalog.rendererPlan?.richMessages ?? [];
  const catalogFlexMessages = catalogMessages.filter((message) => message.type === "flex");
  const catalogBubbles = catalogFlexMessages.flatMap((message) => message.contents.contents);
  assert(
    catalogMessages.length === 3 &&
      catalogFlexMessages.length === 2 &&
      catalogBubbles.length === 11,
    "CF-P19: LINE output must page the 11 online-public offers across two carousels plus one summary message",
  );
  assert(
    catalogBubbles.every((bubble) => Boolean(bubble.hero)),
    "CF-P19: the online-public carousel must use only its approved mapped artwork",
  );
  const finalCatalogPayload = JSON.stringify(catalogMessages);
  assert(
    /Q\+\s*音波/u.test(finalCatalogPayload) && /[週周]年慶活動價\s*7,999/u.test(finalCatalogPayload),
    "CF-P19: a non-ONDA/Botox campaign and its approved price are missing from the final LINE payload",
  );
  assert(
    !/(?:16,888|2026-09-01|2026-11-30|有效期間)/u.test(finalCatalogPayload),
    "CF-P19: final LINE campaign payload leaked superseded or internal data",
  );
  assert(hydratedCatalog.rendererPlan, "CF-P19: promotion catalog did not produce a renderer plan");
  const renderedCatalog = await renderReplyPlan({
    customerMessage: catalogTurn.text,
    dialogueState: rendererDialogueState(),
    generator: async () => {
      throw new Error("CF-P19: approved promotion catalog must not invoke the reply model");
    },
    includeFooter: false,
    plan: hydratedCatalog.rendererPlan,
    recentTurns: [],
  });
  const renderedCatalogFlexMessages = renderedCatalog.messages.filter((message) => message.type === "flex");
  const renderedCatalogBubbles = renderedCatalogFlexMessages.flatMap((message) => message.contents.contents);
  assert(
    renderedCatalog.renderMode === "deterministic" &&
      !renderedCatalog.generatorInvoked &&
      renderedCatalog.messages.length === 3 &&
      renderedCatalogFlexMessages.length === 2 &&
      renderedCatalogBubbles.length === 11,
    "CF-P19: renderer must preserve the paginated online-public carousel and summary within LINE's five-message limit",
  );
  const renderedCatalogPayload = JSON.stringify(renderedCatalog.messages);
  assert(
    /Q\+\s*音波/u.test(renderedCatalogPayload) &&
      /[\u9031周]年慶活動價\s*7,999/u.test(renderedCatalogPayload) &&
      !/(?:16,888|2026-09-01|2026-11-30|有效期間)/u.test(renderedCatalogPayload),
    "CF-P19: renderer changed or leaked the approved promotion catalog payload",
  );
  const renderedCatalogWithFooter = await renderReplyPlan({
    customerMessage: catalogTurn.text,
    dialogueState: rendererDialogueState(),
    footer: "以上為 AI 客服順順初步回覆。",
    generator: async () => {
      throw new Error("CF-P19: approved promotion catalog must not invoke the reply model");
    },
    includeFooter: true,
    plan: hydratedCatalog.rendererPlan,
    recentTurns: [],
  });
  assert(
    renderedCatalogWithFooter.messages.length === 4 &&
      renderedCatalogWithFooter.messages[3]?.type === "text" &&
      renderedCatalogWithFooter.messages[3].text.includes("AI 客服順順"),
    "CF-P19: paginated carousel, summary and required AI disclosure must remain within LINE's five-message limit",
  );
  const expectedPrices: Array<[string, string]> = [
    ["onda_pro", "8,999"],
    ["botox", "999"],
    ["hair_removal_vio", "1,099"],
    ["qplus", "7,999"],
    ["pico", "3,999"],
    ["tenthermage", "8,999"],
    ["tenthermage_eye_tip", "18,888"],
    ["bei_en_xi_brand", "5,999"],
    ["powder_glow_bottle", "11,999"],
  ];

  for (const [treatmentKey, amount] of expectedPrices) {
    const resolved = resolveApprovedPrice(current, { kind: "unspecified", treatmentKeys: [treatmentKey] });
    assert(
      resolved.status === "approved_current" && resolved.customerPriceText.includes(amount),
      `CF-P19: ${treatmentKey} must quote its approved anniversary price ${amount}`,
    );
    if (resolved.status === "approved_current") {
      assert(
        !/(?:2026|9\s*月|11\s*月|截止|到期|有效期間)/u.test(resolved.customerPriceText),
        `CF-P19: ${treatmentKey} leaked internal campaign timing`,
      );
    }
  }

  const onda = resolveApprovedPrice(current, { kind: "regular", treatmentKeys: ["onda_pro"] });
  assert(
    onda.status === "approved_current" &&
      onda.campaignId === "promo-2026-anniv-onda-face-online" &&
      onda.customerPriceText === "周年慶活動價 8,999 元／堂" &&
      !/(?:11,999|12,999|16,888)/u.test(onda.customerPriceText),
    "CF-P19: every ONDA price wording must resolve to the approved anniversary primary offer",
  );
  const ondaExtension = resolveApprovedPrice(current, {
    applicability: { variant: "延伸方案" },
    kind: "campaign",
    treatmentKeys: ["onda_pro"],
  });
  assert(
    ondaExtension.status === "unavailable_to_quote" &&
      ondaExtension.reason === "not_customer_visible" &&
      ondaExtension.provenance.contentKey === "promo-2026-anniv-onda-face-extension",
    "CF-P19: the explicit ONDA extension variant must hand off without borrowing the online ONDA offer",
  );
  const legacyOndaExtension = resolveApprovedPrice(current, {
    campaignId: "promo-2026-anniv-onda-face-extension",
    kind: "campaign",
    treatmentKeys: ["onda_pro"],
  });
  assert(
    legacyOndaExtension.status === "unavailable_to_quote" &&
      legacyOndaExtension.reason === "not_customer_visible" &&
      legacyOndaExtension.provenance.contentKey === "promo-2026-anniv-onda-face-extension",
    "CF-P19: a legacy offline card ID without its old applicability fields must still hand off",
  );
  const botox = resolveApprovedPrice(current, { kind: "regular", treatmentKeys: ["botox"] });
  assert(
    botox.status === "approved_current" &&
      botox.campaignId === "promo-2026-anniv-botox-10u" &&
      botox.customerPriceText === "周年慶活動價 999 元／一區 10U" &&
      !/9,999/u.test(botox.customerPriceText),
    "CF-P19: generic Botox price wording must resolve to the approved anniversary primary offer",
  );
  const botox100u = resolveApprovedPrice(current, {
    applicability: { dose: "100U" },
    kind: "campaign",
    treatmentKeys: ["botox"],
  });
  assert(
    botox100u.status === "unavailable_to_quote" &&
      botox100u.reason === "not_customer_visible" &&
      botox100u.provenance.contentKey === "promo-2026-anniv-botox-100u",
    "CF-P19: the explicit Botox 100U offer must hand off without borrowing the online one-zone offer",
  );

  for (const [campaignId, treatmentKeys, applicability] of [
    ["promo-2026-anniv-tenthermage-900-teosyal1", ["tenthermage", "teosyal_1_3_brand"], { package: "900發＋緹奧希1號" }],
    ["promo-2026-anniv-ultherapy-500-botox100", ["ultherapy", "botox"], { package: "500條＋100U" }],
    ["promo-2026-anniv-ultherapy-1000-botox200-onda", ["ultherapy", "botox", "onda_pro"], { package: "1000條＋200U＋ONDA" }],
    ["promo-2026-anniv-teosyal1", ["teosyal_1_3_brand"], { variant: "1號" }],
    ["promo-2026-anniv-teosyal2-4", ["teosyal_4_brand"], { variant: "2–4號" }],
  ] as const) {
    const resolved = resolveApprovedPrice(current, {
      applicability,
      kind: "campaign",
      treatmentKeys,
    });
    assert(
      resolved.status === "unavailable_to_quote" &&
        resolved.reason === "not_customer_visible" &&
        resolved.provenance.contentKey === campaignId,
      `CF-P19: ${campaignId} must remain an internal anniversary offer`,
    );
  }

  const ailewei = resolveApprovedPrice(current, { kind: "campaign", treatmentKeys: ["ailewei_brand"] });
  assert(
    ailewei.status === "unavailable_to_quote" && ailewei.reason === "not_customer_visible" &&
      ailewei.provenance.contentKey === "promo-2026-anniv-ailewei",
    "CF-P19: unclassified 艾莉薇 must not become a public anniversary offer",
  );

  const legacyOfflineState = createConversationV2State({
    episodeId: "anniversary-legacy-offline-card",
    now: NOW.toISOString(),
  });
  legacyOfflineState.pricingSubjectTreatmentKeys = ["onda_pro"];
  const legacyStateBefore = JSON.stringify(legacyOfflineState);
  const legacyOfflineTurn = turn({
    priceSelection: {
      applicability: { variant: "延伸方案" },
      campaignId: "promo-2026-anniv-onda-face-extension",
      source: "approved_catalog_action",
      treatmentKeys: ["onda_pro"],
    },
    questionAspect: "price_campaign",
    speechAct: "ask_price",
    text: "我想了解 ONDA 臉部延伸方案，周年慶活動價 11,999 元／堂",
    treatments: [],
    turnId: "anniversary-legacy-offline-card",
  });
  const legacyOfflineRoute = routeConversationTurnV2(legacyOfflineState, legacyOfflineTurn);
  assert(!legacyOfflineRoute.duplicate && legacyOfflineRoute.result, "CF-P19: legacy offline card did not route through V2");
  assert(JSON.stringify(legacyOfflineState) === legacyStateBefore, "CF-P19: rejecting a legacy offline card must not rewrite prior state");
  if (legacyOfflineRoute.result) {
    const legacyOfflineHydrated = await hydrateConversationV2ReplyPlan({
      nextState: legacyOfflineRoute.nextState,
      result: legacyOfflineRoute.result,
      snapshot: current,
      turn: legacyOfflineTurn,
    });
    assert(
      legacyOfflineHydrated.priceResolution?.status === "unavailable_to_quote" &&
        legacyOfflineHydrated.priceResolution.reason === "not_customer_visible" &&
        !/11,999/u.test(legacyOfflineHydrated.rendererPlan?.fallbackText ?? ""),
      "CF-P19: a legacy offline card must hand off without restating its old price",
    );
    const legacyRendered = await renderReplyPlan({
      customerMessage: "你剛剛不是說那個價格？",
      dialogueState: rendererDialogueState(),
      generator: async () => {
        throw new Error("CF-P19: rejected offline price must not invoke the reply model from history");
      },
      includeFooter: false,
      plan: legacyOfflineHydrated.rendererPlan!,
      recentTurns: [{ role: "assistant", text: "周年慶活動價 11,999 元／堂", turnId: "old-offline-price" }],
    });
    assert(
      !legacyRendered.generatorInvoked &&
        legacyRendered.replyText.includes("真人客服協助確認") &&
        !/11,999/u.test(legacyRendered.replyText),
      "CF-P19: old conversation history must not revive a now non-public anniversary price",
    );
  }

  const afterAnniversary = await loadClinicFactsSnapshot(
    createStaticClinicFactsProvider({ pricingCampaigns: seed.pricingCampaigns }),
    { now: new Date("2026-12-01T10:00:00+08:00") },
  );
  assert(publicAnniversaryCount(afterAnniversary) === 0, "CF-P19: anniversary offers must stop being public at the end boundary");
  const unavailableOndaAfterAnniversary = resolveApprovedPrice(afterAnniversary, {
    kind: "unspecified",
    treatmentKeys: ["onda_pro"],
  });
  assert(
    unavailableOndaAfterAnniversary.status === "unavailable_to_quote" &&
      unavailableOndaAfterAnniversary.reason === "expired",
    "CF-P19: after the anniversary campaign ends, cancelled legacy ONDA pricing must not be restored",
  );

  const afterEveryOndaOffer = await loadClinicFactsSnapshot(
    createStaticClinicFactsProvider({ pricingCampaigns: seed.pricingCampaigns }),
    { now: new Date("2027-01-01T10:00:00+08:00") },
  );
  const unavailableOnda = resolveApprovedPrice(afterEveryOndaOffer, {
    kind: "unspecified",
    treatmentKeys: ["onda_pro"],
  });
  assert(
    unavailableOnda.status === "unavailable_to_quote" && unavailableOnda.reason === "expired",
    "CF-P19: after every approved ONDA offer expires, pricing must fail closed",
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

async function validateApprovedReplyAssetFailClosed() {
  const assets = buildTreatmentReplyAssets(clinicConfig);
  const fatAsset = assets.find((asset) =>
    asset.kind === "detail" &&
    asset.treatmentKey === "onda_pro" &&
    asset.aspectKey === "jawline_expectation");
  const introAsset = assets.find((asset) =>
    asset.kind === "intro" && asset.treatmentKey === "onda_pro");
  const botoxAsset = assets.find((asset) =>
    asset.kind === "detail" && asset.treatmentKey === "botox");
  assert(fatAsset && introAsset && botoxAsset, "CF-A1: required reviewed asset fixtures are missing");

  const gapKnowledge = treatmentKnowledgeResolver.list().map((item) =>
    item.key === "onda_pro"
      ? {
          ...item,
          availableBrands: [],
          brandReplies: [],
          comfort: "",
          downtime: "",
          expectedDirections: [],
          mechanismInPlainLanguage: "",
        }
      : item);
  const current = await snapshot({
    snapshotId: "clinic-facts-approved-asset-fail-closed",
    treatments: gapKnowledge,
  });

  async function hydrateAssetTurn(input: {
    concernKey?: string;
    questionAspect?: TurnUnderstanding["questionAspect"];
    replyAssetId?: string;
    semanticEvidence?: TurnUnderstanding["semanticEvidence"];
  }) {
    const concernKey = input.concernKey ?? "jawline_looseness";
    const currentTurn = turn({
      areas: [{ confidence: 1, key: "jawline", polarity: "affirmed", resolution: "resolved" }],
      concerns: [{ confidence: 1, key: concernKey, polarity: "affirmed", resolution: "resolved" }],
      conversationMove: "continue",
      dialogueReference: "active_subject",
      questionAspect: input.questionAspect ?? "benefits",
      ...(input.replyAssetId ? { replyAssetId: input.replyAssetId } : {}),
      ...(input.semanticEvidence ? { semanticEvidence: input.semanticEvidence } : {}),
      speechAct: "ask_treatment_detail",
      text: "脂肪堆積",
      treatments: [{ confidence: 1, key: "onda_pro", polarity: "affirmed", resolution: "resolved" }],
      turnId: `asset-${input.questionAspect ?? "benefits"}-${input.replyAssetId ?? "missing"}-${concernKey}`,
    });
    const initial = createConversationV2State({
      episodeId: `asset-${currentTurn.turnId}`,
      now: NOW.toISOString(),
    });
    const routed = routeConversationTurnV2(initial, currentTurn);
    assert(!routed.duplicate && routed.result, `CF-A1: ${currentTurn.turnId} did not route`);
    return hydrateConversationV2ReplyPlan({
      nextState: routed.nextState,
      result: routed.result,
      snapshot: current,
      turn: currentTurn,
    });
  }

  const approved = await hydrateAssetTurn({
    replyAssetId: fatAsset.id,
    semanticEvidence: "approved_asset",
  });
  assert(
    (approved.treatmentResolution?.requestedDataGaps.length ?? 0) > 0,
    "CF-A1: positive control must contain a real requested-data gap",
  );
  assert(!approved.toolRequest, "CF-A1: a matching reviewed detail asset did not satisfy the exact gap");
  assert(
    approved.rendererPlan?.fallbackText.includes(fatAsset.customerCopy),
    "CF-A1: the matching reviewed asset was not delivered to the customer",
  );

  async function assertRejectedAsset(
    label: string,
    input: Parameters<typeof hydrateAssetTurn>[0],
    forbiddenCopy: string,
  ) {
    const hydrated = await hydrateAssetTurn(input);
    assert(
      hydrated.toolRequest?.type === "request_fact_confirmation",
      `${label}: an untrusted or mismatched asset suppressed fact confirmation`,
    );
    assert(
      !hydrated.rendererPlan?.fallbackText.includes(forbiddenCopy),
      `${label}: mismatched asset copy reached the customer`,
    );
  }

  await assertRejectedAsset(
    "CF-A2 missing semantic evidence",
    { replyAssetId: fatAsset.id },
    fatAsset.customerCopy,
  );
  await assertRejectedAsset(
    "CF-A3 intro asset injected into a brand question",
    {
      questionAspect: "brands",
      replyAssetId: introAsset.id,
      semanticEvidence: "approved_asset",
    },
    introAsset.customerCopy,
  );
  await assertRejectedAsset(
    "CF-A4 nonexistent snapshot asset",
    {
      replyAssetId: "treatment:onda_pro:detail:not_in_snapshot",
      semanticEvidence: "approved_asset",
    },
    fatAsset.customerCopy,
  );
  await assertRejectedAsset(
    "CF-A5 cross-treatment asset",
    { replyAssetId: botoxAsset.id, semanticEvidence: "approved_asset" },
    botoxAsset.customerCopy,
  );
  await assertRejectedAsset(
    "CF-A6 wrong concern asset",
    {
      concernKey: "local_contour",
      replyAssetId: fatAsset.id,
      semanticEvidence: "approved_asset",
    },
    fatAsset.customerCopy,
  );
  await assertRejectedAsset(
    "CF-A7 jawline benefits asset injected into side effects",
    {
      questionAspect: "side_effects",
      replyAssetId: fatAsset.id,
      semanticEvidence: "approved_asset",
    },
    fatAsset.customerCopy,
  );
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
    booking: { explicit: true, fields: { treatmentKeys: ["onda_pro"] }, intent: "create" },
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
  await validateUnmodeledTreatmentAspectsFailClosed();
  await validatePriceStateMachine();
  await validateRealSeedPriceOwnership();
  await validateAnniversaryApprovedCatalog();
  await validateVersionedUpdatesWithoutPolicyChanges();
  await validatePriceApplicabilityFlowsThroughV2();
  await validateSnapshotIntegrityAndRecognitionBoundary();
  await validateDynamicOntologyUsesTheSameSnapshot();
  await validateRecognitionRegistryAndInventoryAreIndependent();
  await validateSnapshotKnowledgeIsolation();
  await validateApprovedReplyAssetFailClosed();
  await validateClinicCompletenessAndExcludedRecommendations();
  await validateHydrationAndNonBlockingEffects();
  console.log("Conversation V2 clinic facts validation passed: immutable snapshots, ontology-bound inventory, partial catalogs, pricing, hydration, and typed effects");
}

main().catch((error) => {
  console.error("FAIL:", error);
  process.exitCode = 1;
});
