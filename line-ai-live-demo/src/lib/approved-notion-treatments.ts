import type { CustomerQuickReplyChoice, TreatmentConfig } from "@/lib/clinic-config";

type ApprovedTreatmentSeed = readonly [
  key: string,
  name: string,
  aliases: readonly string[],
  category: TreatmentConfig["category"],
  intro: string,
  humanOnly?: boolean,
];

export type ApprovedNotionTreatment = Omit<
  TreatmentConfig,
  "approvedContent" | "officialSourceDomains"
>;

/** Notion rows already modeled as brand options in the richer Botox family. */
export const APPROVED_NOTION_TREATMENT_MERGES = {
  botox_classic_brand: "botox",
  dysport_brand: "botox",
  neuronox_brand: "botox",
} as const;

const BRANCHES = ["高雄館", "台中館", "桃園館", "林口館"];

const APPROVED_TREATMENT_SEEDS: ApprovedTreatmentSeed[] = [
  ["acne_scar_injection", "消疤（痘）針", ["消疤針", "痘疤針", "消痘疤針"], "laser", "消疤（痘）針是院內可評估的局部痘疤與疤痕改善方向；實際是否適合與施作方式由醫師現場評估。"],
  ["alexandrite_device", "亞歷山大除毛", ["亞歷山大", "亞歷山大除毛", "亞歷山大雷射"], "laser", "亞歷山大除毛可依除毛部位、毛髮粗細與膚況安排評估；實際機型與施作方式由現場人員確認。"],
  ["b_complex_addon", "B-Complex 維他命 B 加購", ["B-Complex", "維他命B", "B群加購"], "laser", "B-Complex 維他命 B 是院內療程的加購品項；是否適合搭配與使用方式需由醫師評估。"],
  ["bei_en_xi_brand", "貝恩希", ["貝恩希", "韓妍玻尿酸", "韓妞玻尿酸"], "injectable", "貝恩希是院內可評估的注射產品；可先了解在意部位與需求，實際成分、用途與施作方式由醫師評估。"],
  ["butterfly_forma_rf", "蝴蝶電波 FORMA", ["蝴蝶電波", "FORMA", "FORMA電波"], "energy", "蝴蝶電波 FORMA 是院內可評估的私密電波療程；可先了解主要困擾，實際適合度與施作安排由醫師評估。"],
  ["co2_fractional_laser", "CO₂ 飛梭雷射", ["CO2飛梭", "CO₂飛梭", "二氧化碳飛梭"], "laser", "CO₂ 飛梭雷射可從毛孔、痘疤與膚質不平整等方向評估；實際機型、能量與施作方式由醫師依膚況確認。"],
  ["cutegel_brand", "Cutegel 珂芮緹玻尿酸", ["Cutegel", "珂芮緹"], "injectable", "Cutegel 珂芮緹是院內可評估的玻尿酸品牌；可先了解在意部位與輪廓需求，實際產品與施作方式由醫師評估。"],
  ["dermapen4_needle_addon", "DERMAPEN 4 微針筆針頭加購", ["DERMAPEN4針頭", "微針筆針頭"], "laser", "DERMAPEN 4 微針筆針頭是院內療程的加購規格；實際是否需要與搭配方式由醫師依療程評估。"],
  ["double_eyelid_surgery", "雙眼皮手術諮詢", ["雙眼皮手術", "割雙眼皮", "縫雙眼皮"], "surgery", "雙眼皮手術屬整形外科評估，AI 可先整理想改善的眼型與需求，實際術式、風險與安排由醫師及真人客服說明。", true],
  ["dual_laser_toning_fiber", "雙機雷射（淨膚＋光纖）", ["雙機雷射", "淨膚加光纖"], "laser", "雙機雷射是院內可評估的淨膚與光纖搭配療程；會依膚況與改善目標由醫師評估適合的施作方式。"],
  ["eye_bag_surgery", "眼袋手術諮詢", ["眼袋手術", "眼袋處理", "割眼袋"], "surgery", "眼袋手術屬整形外科評估，AI 可先整理在意的外觀與基本需求，實際術式、風險與安排由醫師及真人客服說明。", true],
  ["fiber_laser", "光纖雷射", ["光纖", "光纖雷射"], "laser", "光纖雷射是院內可評估的非手術雷射療程；可先了解在意的部位與膚況，實際適合度與施作方式由醫師評估。"],
  ["golden_fairy_brand", "金色仙女", ["金色仙女"], "injectable", "金色仙女是院內可評估的注射產品；實際成分、用途與適合部位由醫師依需求評估。"],
  ["hair_removal_vio", "VIO／私密除毛", ["VIO", "私密除毛", "私密處除毛", "男性私密除毛"], "laser", "VIO／私密除毛會依實際部位、毛髮粗細與膚況評估；可先說明想處理的範圍，實際機型與方案由現場人員確認。"],
  ["hyaluronidase", "玻尿酸降解酶", ["降解酶", "溶解酶", "玻尿酸溶解"], "injectable", "玻尿酸降解酶是院內可評估的調整處置；需由醫師先確認既有填充物、部位與狀況後決定是否適合。"],
  ["juvederm_brand", "喬雅登玻尿酸", ["喬雅登", "Juvederm"], "injectable", "喬雅登是院內可評估的玻尿酸品牌；可先了解在意部位與輪廓需求，實際產品與施作方式由醫師評估。"],
  ["lpg", "LPG 體態療程", ["LPG", "LPG體雕"], "energy", "LPG 體態療程可從想改善的部位與體態困擾開始評估；實際用途、課程安排與適合度由現場人員確認。"],
  ["magic_rf", "魔提電波", ["魔提", "魔提電波"], "energy", "魔提電波是院內可評估的非手術電波療程；會依部位、膚況與緊實需求由醫師評估適合的施作方向。"],
  ["mandelic_acid", "杏仁酸", ["杏仁酸", "酸類保養"], "laser", "杏仁酸可從粉刺、出油與膚況整理方向評估；實際濃度、流程與適合度由專業人員依膚況確認。"],
  ["mole_removal", "點痣", ["點痣", "除痣"], "laser", "點痣需求需先由醫師評估痣的性質、位置與風險，再決定是否適合及處理方向。"],
  ["moqin_hair", "魔沁－魔蘊頭髮", ["魔沁頭髮", "魔蘊頭髮"], "skin_care", "魔沁－魔蘊頭髮是院內可評估的頭皮與髮況保養療程；可先了解主要困擾，實際適合度由醫師評估。"],
  ["moqin_intimate", "魔沁－魔性私密", ["魔沁私密", "魔性私密"], "energy", "魔沁－魔性私密是院內可評估的私密保養療程；可先了解主要困擾，實際適合度與安排由醫師評估。"],
  ["moqin_skin", "魔沁－魔煥皮膚", ["魔沁皮膚", "魔煥皮膚"], "laser", "魔沁－魔煥皮膚是院內可評估的肌膚保養療程；可先了解膚況與改善目標，實際內容由醫師評估。"],
  ["osmidrosis_surgery", "頂漿腺／狐臭手術諮詢", ["頂漿腺手術", "狐臭手術", "腋臭手術"], "surgery", "頂漿腺／狐臭手術屬整形外科評估，AI 可先整理困擾程度與既往處理，實際術式、風險與安排由醫師及真人客服說明。", true],
  ["poseidon_device", "海神除毛", ["海神", "海神除毛"], "laser", "海神除毛可依除毛部位、毛髮粗細與膚況安排評估；實際機型與施作方式由現場人員確認。"],
  ["powder_glow_bottle", "微針超音導賦活粉光瓶", ["粉光瓶", "微針粉光瓶", "超音導粉光瓶"], "skin_care", "微針超音導賦活粉光瓶可從膚質、細紋與穩膚保養方向評估；實際療程內容與適合度由醫師依膚況確認。"],
  ["regenerative_injection_brand", "再生針", ["再生針"], "injectable", "再生針是客人常用的泛稱；院內會依實際產品，再從凹陷、輪廓與膠原支撐需求由醫師評估。"],
  ["rejuran", "麗珠蘭", ["麗珠蘭", "Rejuran"], "injectable", "麗珠蘭是院內可評估的療程；可先從膚質、保水與修護需求了解，實際成分、用途與適合度由醫師評估。"],
  ["restylane_brand", "瑞斯朗 Restylane", ["瑞斯朗", "Restylane"], "injectable", "瑞斯朗是院內可評估的玻尿酸品牌；實際劑型與施作方式會依部位與需求由醫師評估。"],
  ["restylane_defyne_brand", "瑞斯朗 Defyne", ["Defyne", "瑞斯朗Defyne"], "injectable", "瑞斯朗 Defyne 是院內可評估的玻尿酸產品；實際用途與施作方式由醫師依部位評估。"],
  ["restylane_kysse_brand", "瑞斯朗 Kysse", ["Kysse", "瑞斯朗Kysse"], "injectable", "瑞斯朗 Kysse 是院內可評估的玻尿酸產品；實際用途與施作方式由醫師依部位評估。"],
  ["restylane_vital_light_brand", "瑞斯朗 Vital Light", ["Vital Light", "瑞斯朗Vital Light"], "injectable", "瑞斯朗 Vital Light 是院內可評估的玻尿酸產品；實際用途與施作方式由醫師依膚況評估。"],
  ["restylane_volyme_brand", "瑞斯朗 Volyme", ["Volyme", "瑞斯朗Volyme"], "injectable", "瑞斯朗 Volyme 是院內可評估的玻尿酸產品；實際用途與施作方式由醫師依部位評估。"],
  ["rhinoplasty_surgery", "隆鼻手術諮詢", ["隆鼻手術", "鼻整形", "假體隆鼻"], "surgery", "隆鼻手術屬整形外科評估，AI 可先整理想改善的鼻型與需求，實際術式、風險與安排由醫師及真人客服說明。", true],
  ["skin_booster_gun_needle_addon", "水光槍針頭加購", ["水光槍針頭", "水光針頭加購"], "laser", "水光槍針頭是院內療程的加購規格；實際是否需要與搭配方式由醫師依療程評估。"],
  ["sunmax_collagen_brand", "雙美膠原蛋白", ["雙美", "雙美膠原蛋白", "Sunmax"], "injectable", "雙美膠原蛋白是院內可評估的填充產品；可先了解在意部位，實際用途與施作方式由醫師評估。"],
  ["tenthermage_eye_tip", "十蓓眼周探頭", ["眼周電波", "眼周探頭", "十蓓眼周", "十蓓電波眼周", "十倍電波眼周"], "energy", "十蓓眼周探頭是院內可評估的眼周電波方向；是否適合與實際規劃會依眼周狀況由醫師評估。"],
  ["teosyal_1_3_brand", "緹奧希 1–3 號", ["緹奧希1號", "緹奧希2號", "緹奧希3號", "Teosyal"], "injectable", "緹奧希 1–3 號是院內可評估的玻尿酸產品；實際選擇會依部位、層次與需求由醫師評估。"],
  ["teosyal_4_brand", "緹奧希 4 號", ["緹奧希4號", "Teosyal 4"], "injectable", "緹奧希 4 號是院內可評估的玻尿酸產品；實際選擇會依部位、層次與需求由醫師評估。"],
  ["teoxane_rha_brand", "TEOXANE RHA", ["TEOXANE RHA", "RHA玻尿酸"], "injectable", "TEOXANE RHA 是院內可評估的玻尿酸產品；實際選擇會依部位、表情與需求由醫師評估。"],
  ["thread_lift", "埋線拉提／線雕", ["線雕", "埋線拉提", "魚骨線", "鈴鐺線", "MINT線", "美特拉拉提線", "METEORA"], "injectable", "埋線拉提／線雕是院內可評估的非手術輪廓療程；會依部位、鬆弛程度與需求由醫師評估線材與施作方向。"],
  ["thread_nose_sculpting", "埋線鼻雕", ["埋線鼻雕", "線雕鼻", "鼻雕"], "injectable", "埋線鼻雕是院內可評估的鼻型調整方向；可先了解想改善的部位，實際材料、方式與風險由醫師評估。"],
  ["tranexamic_acid_addon", "傳明酸加購", ["傳明酸", "傳明酸加購"], "laser", "傳明酸是院內療程的加購品項；是否適合搭配與使用方式需由醫師依膚況與療程評估。"],
  ["vitamin_c_addon", "維他命 C 加購", ["維他命C", "Vitamin C", "維C加購"], "laser", "維他命 C 是院內療程的加購品項；是否適合搭配與使用方式需由醫師依療程與個人狀況評估。"],
  ["whitening_iv", "美白點滴／注射諮詢", ["美白點滴", "美白針", "美白注射"], "skin_care", "美白點滴／注射是院內可評估的療程方向；實際成分、適合度與風險由醫師確認，AI 不自行承諾效果。"],
  ["ailewei_brand", "艾莉薇", ["艾莉薇", "艾莉薇玻尿酸"], "injectable", "艾莉薇是院內可評估的注射產品；可先了解想改善的部位與方向，實際品項、施作內容與適合度由醫師評估。"],
  ["zinc_addon", "硫酸鋅加購", ["硫酸鋅", "鋅加購"], "injectable", "硫酸鋅是院內療程的加購品項；是否需要搭配與使用方式需由醫師依療程與個人狀況評估。"],
];

function customerQuickReplies(name: string): CustomerQuickReplyChoice[] {
  return [
    { label: "適合方向", text: `想了解 ${name} 適合改善什麼`, stage: "initial" },
    { label: "價格／活動", text: `${name} 目前有活動嗎`, stage: "initial" },
    { label: "預約免費諮詢", text: "我要預約免費諮詢", stage: "initial" },
    { label: "真人客服協助", text: "我要找真人客服", stage: "initial" },
    { label: "預約免費諮詢", text: "我要預約免費諮詢", stage: "followup" },
    { label: "真人客服協助", text: "我要找真人客服", stage: "followup" },
    { label: "繼續詢問", text: `我想繼續了解 ${name}`, stage: "followup" },
  ];
}

export const APPROVED_NOTION_TREATMENTS: ApprovedNotionTreatment[] =
  APPROVED_TREATMENT_SEEDS.map(([key, name, aliases, category, intro, humanOnly]) => ({
    aliases: [...new Set([name, ...aliases])],
    availableBranchNames: [...BRANCHES],
    category,
    consultationGuide: humanOnly
      ? undefined
      : {
          customerQuickReplies: customerQuickReplies(name),
          discoveryQuestion: `😊 您想先了解 ${name} 的適合方向、價格活動，還是安排免費諮詢呢？`,
          featureSummary: intro,
          followupPrompt: "😊 您可以告訴我主要在意的部位或困擾，我先幫您整理評估方向。",
          quickReplies: [
            {
              followupPrompt: "😊 您可以告訴我主要在意的部位或困擾；也可以直接預約免費諮詢，由醫師現場評估。",
              key: "approved_l1_followup",
              reply: intro,
              terms: [`想了解 ${name} 適合改善什麼`, `我想繼續了解 ${name}`],
            },
          ],
        },
    educationMode: humanOnly ? "human_only" : "general_education",
    evaluationNote: humanOnly
      ? "此項屬整形外科評估，由真人客服與醫師接續說明。"
      : "實際適合度、施作內容與療程安排仍需由醫師現場評估。",
    intro,
    key,
    name,
    ...(key === "tenthermage_eye_tip"
      ? {
          recognitionTerms: ["眼周300發"],
          availableBrands: ["十蓓電波眼周探頭"],
          brandReply: "🟢 院內眼周電波目前以十蓓電波眼周探頭評估；是否適合與實際發數，仍會依眼周狀況由醫師確認。",
        }
      : {}),
  }));
