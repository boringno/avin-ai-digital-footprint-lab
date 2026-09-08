import { clinicConfig } from "@/lib/clinic-config";
import { assertContentDraftInput, type ContentDraftInput } from "@/lib/content-versioning";

export const APPROVED_STANDING_PRICE_IMPORT_BATCH_KEY = "standing-price-pdf-20260831-approved-v1";
export const APPROVED_STANDING_PRICE_IMPORT_SOURCE_LABEL = "診所核准常態線上報價 PDF（2026-08-31）";
export const APPROVED_STANDING_PRICE_IMPORT_TENANT_ID = "tenant_001";
export const APPROVED_STANDING_PRICE_IMPORT_EXCLUSIONS = [
  { count: 1, reason: "已取消的 ONDA 16,888 方案" },
  { count: 2, reason: "原資料明列 LINE 不報價的蝴蝶電波 FORMA／Ultherapy" },
  { count: 2, reason: "館別公開規則尚未確認的 ILIB 敦輝／長安" },
  { count: 5, reason: "條件尚未填完的草稿 placeholder" },
] as const;

/**
 * Review-stage source for clinic-approved standing online prices.
 *
 * This is deliberately NOT a runtime source of truth.  It turns the approved
 * Notion rows into content drafts; the existing review -> publish -> runtime
 * release workflow remains the only path that exposes a price to customers.
 */
export type ApprovedStandingPriceImportRow = {
  aliases: readonly string[];
  branchScope?: string;
  customerPriceText: string;
  dose?: string;
  offerKey: string;
  packageKey?: string;
  price: number;
  sessionCount?: number;
  treatmentKey: string;
  variantKey?: string;
};

type RowInput = Omit<ApprovedStandingPriceImportRow, "aliases" | "customerPriceText"> & {
  aliases?: readonly string[];
  label: string;
};

function row(input: RowInput): ApprovedStandingPriceImportRow {
  return {
    aliases: [input.label, ...(input.aliases ?? [])],
    branchScope: input.branchScope ?? "全館",
    customerPriceText: `${input.label}目前院內核准參考為 ${input.price.toLocaleString("zh-TW")} 元。`,
    dose: input.dose,
    offerKey: input.offerKey,
    packageKey: input.packageKey,
    price: input.price,
    sessionCount: input.sessionCount,
    treatmentKey: input.treatmentKey,
    variantKey: input.variantKey,
  };
}

/**
 * 62 rows already marked "已核准 / LINE可否報價=可以" in the clinic's
 * standing-price Notion table.  The following are intentionally excluded:
 * - cancelled ONDA 16,888 offer;
 * - Butterfly FORMA and Ultherapy rows marked "LINE 不報價" in their terms;
 * - the two ILIB branch-price rows until the clinic chooses one public rule;
 * - five draft placeholder rows that still ask the clinic to complete terms.
 */
export const APPROVED_STANDING_PRICE_IMPORT_ROWS: readonly ApprovedStandingPriceImportRow[] = [
  row({ offerKey: "clinic_price_pdf_20260831__botox_classic_brand__2030713", label: "BOTOX 肉毒 12U", aliases: ["經典肉毒12U", "BOTOX12U"], treatmentKey: "botox", variantKey: "botox_classic", dose: "12U", price: 1999 }),
  row({ offerKey: "clinic_price_pdf_20260831__coolsculpting__2060293", label: "酷立塑", treatmentKey: "coolsculpting", price: 5999 }),
  row({ offerKey: "clinic_price_pdf_20260831__dual_laser_toning_fiber__1680408", label: "雙機雷射（淨膚＋光纖）", aliases: ["雙機雷射", "淨膚加光纖"], treatmentKey: "dual_laser_toning_fiber", price: 1999 }),
  row({ offerKey: "clinic_price_pdf_20260831__dysport_brand__2030020", label: "Dysport 皇家肉毒", aliases: ["皇家肉毒", "Dysport"], treatmentKey: "botox", variantKey: "dysport", price: 1799 }),
  row({ offerKey: "clinic_price_pdf_20260831__ellanse__2031141", label: "伊蓮絲", treatmentKey: "ellanse", price: 21999 }),
  row({ offerKey: "clinic_price_pdf_20260831__embody__2060557", label: "EMBODY", treatmentKey: "embody", price: 5999 }),
  row({ offerKey: "clinic_price_pdf_20260831__emface__2060563", label: "EMFACE", treatmentKey: "emface", price: 19999 }),
  row({ offerKey: "clinic_price_pdf_20260831__fat_dissolving_injection__2030456", label: "消脂針", treatmentKey: "fat_dissolving_injection", price: 3999 }),
  row({ offerKey: "clinic_price_pdf_20260831__fat_dissolving_injection_ronkyla__2031067", label: "Ronkyla 蝶安敏", aliases: ["Ronkyla", "蝶安敏"], treatmentKey: "fat_dissolving_injection", variantKey: "ronkyla", price: 7999 }),
  row({ offerKey: "clinic_price_pdf_20260831__fiber_laser__1680415", label: "光纖雷射", treatmentKey: "fiber_laser", price: 999 }),
  row({ offerKey: "clinic_price_pdf_20260831__fractional_laser__1680419", label: "飛梭雷射", treatmentKey: "fractional_laser", variantKey: "full", price: 1999 }),
  row({ offerKey: "clinic_price_pdf_20260831__fractional_laser_local__1680423", label: "飛梭雷射局部", aliases: ["局部飛梭"], treatmentKey: "fractional_laser", variantKey: "local", price: 999 }),
  row({ offerKey: "clinic_price_pdf_20260831__g_tightening_laser__2010084", label: "維密 G 緊雷射", treatmentKey: "g_tightening_laser", price: 8999 }),
  row({ offerKey: "clinic_price_pdf_20260831__ha35_skin__2031182", label: "HA35 活膚療程", treatmentKey: "ha35_skin_rejuvenation", variantKey: "ha35", price: 7999 }),
  row({ offerKey: "clinic_price_pdf_20260831__ha35_skin__2031183", label: "HA35 活膚療程（另一核准規格）", treatmentKey: "ha35_skin_rejuvenation", variantKey: "ha35_alternate", price: 7999 }),
  row({ offerKey: "clinic_price_pdf_20260831__ha35_plus__2031184", label: "HA35 Plus 活膚療程", treatmentKey: "ha35_skin_rejuvenation", variantKey: "ha35_plus", price: 8999 }),
  row({ offerKey: "clinic_price_pdf_20260831__hair_removal_male_upper_lip__2010327", label: "男性上唇除毛", treatmentKey: "hair_removal", variantKey: "male_upper_lip", price: 999 }),
  row({ offerKey: "clinic_price_pdf_20260831__hair_removal_female_thigh__2010447", label: "女性大腿除毛", treatmentKey: "hair_removal", variantKey: "female_thigh", price: 1680 }),
  row({ offerKey: "clinic_price_pdf_20260831__hair_removal_female_underarm__2010513", label: "女性腋下除毛", treatmentKey: "hair_removal", variantKey: "female_underarm", price: 599 }),
  row({ offerKey: "clinic_price_pdf_20260831__hair_removal_female_arms__2010514", label: "女性手臂除毛", treatmentKey: "hair_removal", variantKey: "female_arms", price: 1280 }),
  row({ offerKey: "clinic_price_pdf_20260831__hair_removal_female_calf__2010515", label: "女性小腿除毛", treatmentKey: "hair_removal", variantKey: "female_calf", price: 1480 }),
  row({ offerKey: "clinic_price_pdf_20260831__hair_removal_female_full_leg__2010516", label: "女性全腿除毛", treatmentKey: "hair_removal", variantKey: "female_full_leg", price: 1980 }),
  row({ offerKey: "clinic_price_pdf_20260831__hair_removal_male_underarm__2120011", label: "男性腋下除毛", treatmentKey: "hair_removal", variantKey: "male_underarm", price: 799 }),
  row({ offerKey: "clinic_price_pdf_20260831__hair_removal_vio_female_local__2010374", label: "女性 VIO 局部除毛", treatmentKey: "hair_removal_vio", variantKey: "female_local", price: 1288 }),
  row({ offerKey: "clinic_price_pdf_20260831__hair_removal_vio_male_local__2010377", label: "男性 VIO 局部除毛", treatmentKey: "hair_removal_vio", variantKey: "male_local", price: 2288 }),
  row({ offerKey: "clinic_price_pdf_20260831__hair_removal_vio_male_full__2010383", label: "男性 VIO 全除毛", treatmentKey: "hair_removal_vio", variantKey: "male_full", price: 3280 }),
  row({ offerKey: "clinic_price_pdf_20260831__hair_removal_vio_female_full__2010517", label: "女性 VIO 全除毛", treatmentKey: "hair_removal_vio", variantKey: "female_full", price: 1888 }),
  row({ offerKey: "clinic_price_pdf_20260831__juvederm_brand__2030778", label: "喬雅登玻尿酸", treatmentKey: "juvederm_brand", price: 13999 }),
  row({ offerKey: "clinic_price_pdf_20260831__laser_toning__1680412", label: "淨膚雷射", treatmentKey: "laser_toning", price: 999 }),
  row({ offerKey: "clinic_price_pdf_20260831__lumecca__2010630", label: "LUMECCA 三倍光", treatmentKey: "lumecca", price: 1999 }),
  row({ offerKey: "clinic_price_pdf_20260831__m22_ipl__1680445", label: "M22 彩衝光", treatmentKey: "m22_ipl", price: 1299 }),
  row({ offerKey: "clinic_price_pdf_20260831__moqin_hair__2031205", label: "魔沁－魔蘊頭髮", treatmentKey: "moqin_hair", price: 20999 }),
  row({ offerKey: "clinic_price_pdf_20260831__moqin_intimate__2031174", label: "魔沁－魔性私密", treatmentKey: "moqin_intimate", price: 15999 }),
  row({ offerKey: "clinic_price_pdf_20260831__moqin_skin__2031172", label: "魔沁－魔煥皮膚", treatmentKey: "moqin_skin", price: 17999 }),
  row({ offerKey: "clinic_price_pdf_20260831__neuronox_brand__2030947", label: "奇蹟肉毒", aliases: ["Neuronox", "優力柔"], treatmentKey: "botox", variantKey: "neuronox", price: 1499 }),
  row({ offerKey: "clinic_price_pdf_20260831__panda_needle__2031121", label: "熊貓針", treatmentKey: "panda_needle", price: 13999 }),
  row({ offerKey: "clinic_price_pdf_20260831__pelvic_floor_chair__2060562", label: "G 動幸福椅", treatmentKey: "pelvic_floor_chair", branchScope: "台中館", price: 3999 }),
  row({ offerKey: "clinic_price_pdf_20260831__phoenix_thermage__2040098", label: "鳳凰電波", treatmentKey: "phoenix_thermage", price: 140000 }),
  row({ offerKey: "clinic_price_pdf_20260831__pico_tattoo__1680427", label: "探索皮秒洗刺青", aliases: ["皮秒洗刺青"], treatmentKey: "pico", variantKey: "tattoo", price: 3999 }),
  row({ offerKey: "clinic_price_pdf_20260831__pico_honeycomb_full_face__1680437", label: "探索皮秒＋蜂巢全臉", aliases: ["皮秒蜂巢全臉"], treatmentKey: "pico", variantKey: "honeycomb_full_face", price: 5999 }),
  row({ offerKey: "clinic_price_pdf_20260831__pico_honeycomb_local__1680441", label: "探索皮秒＋蜂巢局部", aliases: ["皮秒蜂巢局部"], treatmentKey: "pico", variantKey: "honeycomb_local", price: 3999 }),
  row({ offerKey: "clinic_price_pdf_20260831__pico__1680461", label: "探索皮秒", treatmentKey: "pico", variantKey: "pico", price: 1999 }),
  row({ offerKey: "clinic_price_pdf_20260831__pico_honeycomb_tip__1680433", label: "蜂巢探頭", treatmentKey: "pico_honeycomb_tip", price: 3999 }),
  row({ offerKey: "clinic_price_pdf_20260831__pico_honeycomb_tip_local__1680463", label: "蜂巢探頭局部", treatmentKey: "pico_honeycomb_tip", variantKey: "local", price: 2499 }),
  row({ offerKey: "clinic_price_pdf_20260831__poseidon_female_underarm__2010584", label: "海神除毛女性腋下", treatmentKey: "poseidon_device", variantKey: "female_underarm", price: 999 }),
  row({ offerKey: "clinic_price_pdf_20260831__poseidon_male_underarm__2010585", label: "海神除毛男性腋下", treatmentKey: "poseidon_device", variantKey: "male_underarm", price: 1399 }),
  row({ offerKey: "clinic_price_pdf_20260831__poseidon_beard__2010586", label: "海神除毛鬍鬚單堂", treatmentKey: "poseidon_device", variantKey: "beard", price: 1399 }),
  row({ offerKey: "clinic_price_pdf_20260831__poseidon_female_arms__2010587", label: "海神除毛女性手臂", treatmentKey: "poseidon_device", variantKey: "female_arms", price: 1899 }),
  row({ offerKey: "clinic_price_pdf_20260831__poseidon_female_calf__2010588", label: "海神除毛女性小腿", treatmentKey: "poseidon_device", variantKey: "female_calf", price: 2199 }),
  row({ offerKey: "clinic_price_pdf_20260831__poseidon_female_thigh__2010589", label: "海神除毛女性大腿", treatmentKey: "poseidon_device", variantKey: "female_thigh", price: 2399 }),
  row({ offerKey: "clinic_price_pdf_20260831__poseidon_female_vio_full__2010590", label: "海神除毛女性 VIO 全除毛", treatmentKey: "poseidon_device", variantKey: "female_vio_full", price: 2899 }),
  row({ offerKey: "clinic_price_pdf_20260831__poseidon_male_vio_full__2010591", label: "海神除毛男性 VIO 全除毛", treatmentKey: "poseidon_device", variantKey: "male_vio_full", price: 3899 }),
  row({ offerKey: "clinic_price_pdf_20260831__poseidon_full_leg__2010597", label: "海神除毛全腿", treatmentKey: "poseidon_device", variantKey: "full_leg", price: 3099 }),
  row({ offerKey: "clinic_price_pdf_20260831__poseidon_female_vio_local__2010598", label: "海神除毛女性 VIO 局部", treatmentKey: "poseidon_device", variantKey: "female_vio_local", price: 1899 }),
  row({ offerKey: "clinic_price_pdf_20260831__poseidon_male_vio_local__2010599", label: "海神除毛男性 VIO 局部", treatmentKey: "poseidon_device", variantKey: "male_vio_local", price: 3399 }),
  row({ offerKey: "clinic_price_pdf_20260831__poseidon_full_face__2010655", label: "海神除毛全臉", treatmentKey: "poseidon_device", variantKey: "full_face", price: 1999 }),
  row({ offerKey: "clinic_price_pdf_20260831__rejuran__2031189", label: "麗珠蘭", treatmentKey: "rejuran", price: 8999 }),
  row({ offerKey: "clinic_price_pdf_20260831__restylane_brand__2030811", label: "瑞斯朗 Restylane", treatmentKey: "restylane_brand", price: 12999 }),
  row({ offerKey: "clinic_price_pdf_20260831__skin_booster__2030864", label: "水光針", treatmentKey: "skin_booster", price: 5999 }),
  row({ offerKey: "clinic_price_pdf_20260831__thread_lift__2030444", label: "埋線拉提／線雕", treatmentKey: "thread_lift", price: 29999 }),
  row({ offerKey: "clinic_price_pdf_20260831__vivabella__2030902", label: "薇貝拉", treatmentKey: "vivabella", variantKey: "50mg", price: 23999 }),
  row({ offerKey: "clinic_price_pdf_20260831__vivabella__2030937", label: "薇貝拉", treatmentKey: "vivabella", variantKey: "200mg", price: 23999 }),
] as const;

const excludedOfferKeys = new Set([
  "clinic_price_pdf_20260831__onda_pro__2060573",
  "clinic_price_pdf_20260831__butterfly_forma_rf__no_online_quote",
  "clinic_price_pdf_20260831__ultherapy__no_online_quote",
  "clinic_price_pdf_20260831__ilib__2050241",
  "clinic_price_pdf_20260831__ilib__2050274",
]);

function treatmentFor(key: string) {
  const treatment = clinicConfig.treatmentList.find((candidate) => candidate.key === key);
  if (!treatment) {
    throw new Error(`常態報價匯入資料指向不存在的療程：${key}`);
  }
  return treatment;
}

export function toStandingPriceDraft(row: ApprovedStandingPriceImportRow): ContentDraftInput {
  if (excludedOfferKeys.has(row.offerKey) || row.offerKey.startsWith("draft:")) {
    throw new Error(`未核准或尚待診所決策的方案不可建立草稿：${row.offerKey}`);
  }
  const treatment = treatmentFor(row.treatmentKey);
  const draft: ContentDraftInput = {
    changeReason: "匯入診所已核准常態線上報價；建立草稿後仍需走既有審核、發布與 Runtime Snapshot 流程。",
    contentKey: row.offerKey,
    contentType: "campaign",
    displayName: `常態核准報價｜${row.offerKey}`,
    endAt: null,
    payload: {
      asset_urls: [],
      branch_scope: row.branchScope ?? "全館",
      booking_treatments: [treatment.name],
      aliases: [treatment.name, ...treatment.aliases, ...row.aliases],
      campaign_name: `常態核准報價｜${row.offerKey}`,
      customer_price_text: row.customerPriceText,
      dose: row.dose ?? "",
      fallback_message: "方案內容與是否適合仍會依現場評估確認；若您想安排，我可以先協助整理預約需求。",
      package_key: row.packageKey ?? "",
      price_text: `${row.price.toLocaleString("zh-TW")} 元`,
      pricing_kind: "standing",
      quote_priority: "10",
      session_count: row.sessionCount ? String(row.sessionCount) : "",
      starts_booking_intake: "true",
      treatment_name: treatment.name,
      variant_key: row.variantKey ?? "",
    },
    startAt: null,
  };
  assertContentDraftInput(draft);
  return draft;
}

export function standingPriceImportSummary() {
  const treatmentKeys = new Set(APPROVED_STANDING_PRICE_IMPORT_ROWS.map((row) => row.treatmentKey));
  return {
    candidates: APPROVED_STANDING_PRICE_IMPORT_ROWS.length,
    treatmentCount: treatmentKeys.size,
  };
}

export function approvedStandingPriceDrafts() {
  return APPROVED_STANDING_PRICE_IMPORT_ROWS
    .map(toStandingPriceDraft)
    .sort((left, right) => left.contentKey.localeCompare(right.contentKey, "en"));
}
