import { clinicConfig, findTreatmentByMessage, type ClinicConfig, type TreatmentConfig } from "../src/lib/clinic-config";
import { APPROVED_NOTION_TREATMENT_MERGES } from "../src/lib/approved-notion-treatments";
import {
  CLINIC_CONFIG_CONTENT_VERSION,
  adaptTreatmentConfigToKnowledge,
  buildTreatmentApprovedFacts,
  createTreatmentKnowledgeResolver,
} from "../src/lib/treatment-knowledge";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function requireTreatment(key: string) {
  const treatment = clinicConfig.treatmentList.find((item) => item.key === key);
  assert(treatment, `TK0: missing clinic treatment ${key}`);
  return treatment;
}

function validateAllExistingTreatments() {
  const resolver = createTreatmentKnowledgeResolver();
  const all = resolver.list();
  assert(all.length === 89, `TK1: expected 89 canonical approved treatments, got ${all.length}`);
  assert(new Set(all.map((item) => item.key)).size === all.length, "TK1: normalized keys must be unique");

  for (const item of all) {
    assert(item.key && item.name, `TK1: ${item.key} must keep identity`);
    assert(Array.isArray(item.aliases), `TK1: ${item.key} must expose aliases`);
    assert(item.clinicAvailability.isAvailable, `TK1: ${item.key} must be marked as offered by this clinic config`);
    assert(Array.isArray(item.suitableConcerns) && Array.isArray(item.areas), `TK1: ${item.key} must expose concern and area arrays`);
    assert(typeof item.mechanismInPlainLanguage === "string", `TK1: ${item.key} must expose mechanism text`);
    assert(Array.isArray(item.expectedDirections), `TK1: ${item.key} must expose expected directions`);
    assert(Array.isArray(item.combinationOptions) && typeof item.combinationReasons === "object", `TK1: ${item.key} must expose combination knowledge`);
    assert(Array.isArray(item.approvedPriceIds), `TK1: ${item.key} must expose price ids`);
    assert(Array.isArray(item.officialSources), `TK1: ${item.key} must expose official sources`);
    assert(item.approvalStatus && item.contentVersion, `TK1: ${item.key} must expose approval and version`);
  }
}

function validatePackedTreatments() {
  const resolver = createTreatmentKnowledgeResolver();
  const onda = resolver.resolveByKey("onda_pro");
  assert(onda?.hasConsultationPack, "TK2: ONDA must retain its consultation pack marker");
  assert(onda.suitableConcerns.includes("jawline_looseness") && onda.suitableConcerns.includes("local_contour"), "TK2: ONDA concern mapping failed");
  assert(onda.areas.includes("jawline") && onda.areas.includes("body"), "TK2: ONDA area mapping failed");
  assert(onda.approvedPriceIds.includes("promo-2026-anniv-onda-face-online"), "TK2: ONDA current approved price id failed");
  assert(onda.approvedPriceIds.includes("promo-2026-08-face-contour-combo"), "TK2: ONDA legacy journey price reference must remain available for isolated fixtures");
  assert(onda.combinationOptions.includes("botox_small_face") && Boolean(onda.combinationReasons.botox_small_face), "TK2: ONDA combination mapping failed");

  const botox = resolver.resolveByKey("botox");
  assert(botox?.hasConsultationPack, "TK3: Botox must retain its consultation pack marker");
  assert(botox.suitableConcerns.includes("dynamic_wrinkles") && botox.suitableConcerns.includes("masseter_contour"), "TK3: Botox concern mapping failed");
  assert(botox.approvedPriceIds.includes("promo-2026-anniv-botox-10u"), "TK3: Botox approved price mapping failed");
  assert(botox.availableBrands.length >= 3, "TK3: Botox available brands must be retained");

  const pico = resolver.resolveByKey("pico");
  assert(pico?.hasConsultationPack, "TK4: Pico must retain its consultation pack marker");
  assert(["pores_texture", "acne_scar", "dullness_brightening"].every((key) => pico.suitableConcerns.includes(key)), "TK4: Pico concern mapping failed");
  assert(buildTreatmentApprovedFacts(pico).length > 0, "TK4: Pico must expose approved facts for a reply plan");
}

function validateNotionApprovedTreatments() {
  const expectedKeys = [
    "hair_removal_vio",
    "tenthermage_eye_tip",
    "bei_en_xi_brand",
    "powder_glow_bottle",
    "ailewei_brand",
    "butterfly_forma_rf",
  ];

  for (const key of expectedKeys) {
    const treatment = requireTreatment(key);
    assert(treatment.approvedContent.introReplies[0]?.trim(), `TK8: ${key} must have approved first-level copy`);
    assert(
      treatment.availableBranchNames?.length === clinicConfig.branches.length,
      `TK8: ${key} must be available at all four approved branches`,
    );
    assert(
      treatment.consultationGuide?.customerQuickReplies?.some((choice) => choice.text === "我要預約免費諮詢"),
      `TK8: ${key} must expose a booking quick reply`,
    );
  }

  for (const key of ["double_eyelid_surgery", "eye_bag_surgery", "osmidrosis_surgery", "rhinoplasty_surgery"]) {
    const treatment = requireTreatment(key);
    assert(treatment.educationMode === "human_only", `TK8: ${key} must remain human-only`);
    assert(!treatment.consultationGuide, `TK8: ${key} must not enter automated treatment consultation`);
  }

  assert(
    findTreatmentByMessage("韓妍玻尿酸多少錢")?.key === "bei_en_xi_brand",
    "TK8: direct approved alias must win over the generic filler family",
  );
  assert(
    findTreatmentByMessage("想問奇蹟肉毒")?.key === "botox",
    "TK8: approved Botox brand alias must resolve to the canonical Botox conversation family",
  );
  assert(
    Object.values(APPROVED_NOTION_TREATMENT_MERGES).every((key) => key === "botox") &&
      Object.keys(APPROVED_NOTION_TREATMENT_MERGES).length === 3,
    "TK8: all three approved Botox brand rows must be explicitly merged into the canonical family",
  );
}

function validateNoPackAndMissingValues() {
  const resolver = createTreatmentKnowledgeResolver();
  const dermapen = resolver.resolveByKey("dermapen4");
  assert(dermapen && !dermapen.hasConsultationPack, "TK5: DERMAPEN 4 must work without a consultation pack");
  assert(dermapen.comfort === null && dermapen.downtime === null, "TK5: missing comfort and downtime must normalize to null");
  assert(dermapen.combinationOptions.length === 0 && Object.keys(dermapen.combinationReasons).length === 0, "TK5: missing combinations must normalize to empty structures");
  assert(dermapen.officialSources.includes("dermapenworld.com"), "TK5: product official source must be retained");
  assert(dermapen.approvalStatus === "approved" && dermapen.contentVersion === CLINIC_CONFIG_CONTENT_VERSION, "TK5: approval/version defaults failed");
  assert(resolver.resolveByMessage("想了解 DERMAPEN 4 的一般資訊")?.key === "dermapen4", "TK5: no-pack treatment must resolve by message");
}

function validateNewConfigWithoutRouterException() {
  const customTreatment: TreatmentConfig = {
    aliases: ["future device", "未來儀器"],
    approvedContent: {
      brandReplies: [],
      introReplies: ["未來儀器核准介紹。"],
      unsupportedReply: "目前資料不足。",
    },
    category: "energy",
    educationMode: "general_education",
    evaluationNote: "實際仍需現場評估。",
    intro: "未來儀器核准介紹。",
    key: "future_device",
    name: "Future Device",
    officialSourceDomains: ["https://www.example.com/product/details"],
  };
  const customConfig: ClinicConfig = {
    ...clinicConfig,
    concernList: [
      ...clinicConfig.concernList,
      {
        areaKeys: ["face"],
        key: "future_concern",
        keywords: ["未來困擾"],
        label: "未來困擾",
        recommendedTreatmentKeys: ["future_device"],
        summary: "未來困擾的核准改善方向。",
      },
    ],
    treatmentList: [...clinicConfig.treatmentList, customTreatment],
  };
  const resolver = createTreatmentKnowledgeResolver(customConfig, {
    future_device: {
      approvalStatus: "draft",
      contentVersion: "future-device-v2",
      downtime: "依個人狀況評估。",
    },
  });
  const custom = resolver.resolveByMessage("我想問未來儀器");

  assert(custom?.key === "future_device", "TK6: a newly appended config must resolve without Router changes");
  assert(custom.suitableConcerns.includes("future_concern") && custom.areas.includes("face"), "TK6: new concern/area mapping must be data-driven");
  assert(custom.officialSources.length === 1 && custom.officialSources[0] === "example.com", "TK6: official URL must normalize to an internal domain");
  assert(custom.approvalStatus === "draft" && custom.contentVersion === "future-device-v2", "TK6: explicit approval/version must win");
  assert(custom.comfort === null && custom.downtime === "依個人狀況評估。", "TK6: explicit and missing optional fields must remain distinct");
  assert(resolver.resolveForConcern("future_concern").some((item) => item.key === "future_device"), "TK6: concern resolver must include new config");
}

function validateAdapterDirectly() {
  const knowledge = adaptTreatmentConfigToKnowledge(requireTreatment("breast_implant_consultation"));
  assert(knowledge.educationMode === "human_only", "TK7: surgery must remain human-only");
  assert(knowledge.officialSources.length === 0, "TK7: surgery must not expose official-source browsing domains");
}

function main() {
  validateAllExistingTreatments();
  validatePackedTreatments();
  validateNoPackAndMissingValues();
  validateNewConfigWithoutRouterException();
  validateAdapterDirectly();
  validateNotionApprovedTreatments();
  console.log("Treatment knowledge validation passed: 89 canonical approved treatments, packs, Notion L1 content, quick replies, branches, sources, versions, and generic extension");
}

try {
  main();
} catch (error) {
  console.error("FAIL:", error);
  process.exitCode = 1;
}
