import { redirect } from "next/navigation";

import { canViewEngineeringKnowledge, getAdminStaffFromCookies } from "@/lib/admin-auth";
import { loadAdminContent } from "@/lib/admin-content-data";
import { clinicConfig } from "@/lib/clinic-config";
import { loadSeedData } from "@/lib/seed-loader";

import { AdminPageHeader } from "../../_components/AdminPageHeader";
import { KnowledgeMapClient, type KnowledgeMapEntry } from "./KnowledgeMapClient";

function activeStatus(input: { approval_status: string; end_date?: string; is_active: string; start_date?: string }, today: string) {
  if (input.is_active !== "true" || input.approval_status !== "approved") return "未啟用";
  if (input.start_date && input.start_date > today) return "待生效";
  if (input.end_date && input.end_date < today) return "已到期";
  return "目前生效";
}

export default async function EngineeringKnowledgePage() {
  const staff = await getAdminStaffFromCookies();
  if (!staff) redirect("/admin/login");
  if (!canViewEngineeringKnowledge(staff.role)) redirect("/admin/forbidden");

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const seedData = await loadSeedData();
  const contentItems = await loadAdminContent(staff).catch(() => []);
  const entries: KnowledgeMapEntry[] = [
    {
      details: "優先序：醫療安全與轉真人 → 預約流程 → 館別／FAQ → 客戶需求分流 → 價格 → 療程短答。\n任何病史、孕期、術後不適與療效保證問題，都不會由療程題庫直接延伸回答。",
      prompts: ["懷孕", "哺乳", "病史", "過敏", "術後不適", "保證有效"],
      section: "系統回覆邊界",
      source: "src/lib/router.ts",
      status: "工程規則",
      title: "安全優先與資料路由",
    },
    ...clinicConfig.treatmentList.flatMap((treatment) => [
      {
        details: `${treatment.intro}\n${treatment.evaluationNote}`,
        prompts: treatment.aliases,
        section: "療程第一層介紹",
        source: "src/lib/clinic-config.ts",
        status: "院內核准",
        title: treatment.name,
      },
      ...(treatment.consultationGuide?.quickReplies ?? []).map((reply) => ({
        details: `${reply.reply}\n下一步：${reply.followupPrompt}`,
        prompts: reply.terms,
        section: "療程短答題庫",
        source: "src/lib/clinic-config.ts",
        status: "院內核准",
        title: `${treatment.name}｜${reply.key}`,
      })),
    ]),
    ...clinicConfig.concernList.map((concern) => ({
      details: `分流至：${concern.recommendedTreatmentKeys.join("、")}。${concern.summary}`,
      prompts: concern.keywords,
      section: "客戶需求分流",
      source: "src/lib/clinic-config.ts",
      status: "院內核准",
      title: concern.key,
    })),
    ...seedData.faqEntries.map((faq) => ({
      details: faq.answer_text,
      prompts: [faq.question_pattern],
      section: "FAQ 基線資料",
      source: "data/live-demo-seed/approved_faq_seed.csv",
      status: faq.is_active === "true" && faq.approval_status === "approved" ? "目前生效" : "未啟用",
      title: faq.topic || "未分類 FAQ",
    })),
    ...seedData.pricingCampaigns.map((campaign) => ({
      details: `${campaign.treatment_name}｜${campaign.price_text}｜適用：${campaign.branch_scope || "依現場"}｜期間：${campaign.start_date} ～ ${campaign.end_date}`,
      prompts: [campaign.treatment_name, campaign.campaign_name, campaign.campaign_aliases].filter(Boolean),
      section: "價格與活動基線資料",
      source: "data/live-demo-seed/approved_pricing_campaigns_seed.csv",
      status: activeStatus(campaign, today),
      title: campaign.campaign_name,
    })),
    ...seedData.handoffRules.map((rule) => ({
      details: rule.handoff_message,
      prompts: [rule.pattern],
      section: "轉真人與安全規則",
      source: "data/live-demo-seed/approved_handoff_rules_runtime_seed.csv",
      status: rule.is_active === "true" && rule.approval_status === "approved" ? "目前生效" : "未啟用",
      title: rule.trigger_type,
    })),
    ...seedData.pregnancyRules.map((rule) => ({
      details: rule.guidance_reply,
      prompts: [rule.aliases, rule.treatment_name].filter(Boolean),
      section: "孕期與醫療風險規則",
      source: "data/live-demo-seed/approved_pregnancy_rules_seed.csv",
      status: rule.is_active === "true" && rule.approval_status === "approved" ? "目前生效" : "未啟用",
      title: rule.treatment_name || "通用孕期風險",
    })),
    ...contentItems.flatMap((item) => item.versions.slice(0, 1).map((version) => ({
      details: `版本 ${version.versionNo}｜狀態：${version.status}${version.changeReason ? `｜原因：${version.changeReason}` : ""}`,
      prompts: [item.contentKey, item.displayName],
      section: "內容版本與來源",
      source: "Supabase content_items / content_versions",
      status: version.status === "published" ? "目前生效" : version.status,
      title: item.displayName,
    }))),
  ];

  return (
    <main style={{ background: "#f6faf8", minHeight: "100vh", padding: "16px 12px 128px" }}>
      <div style={{ margin: "0 auto", maxWidth: 1180 }}>
        <AdminPageHeader
          activeHref="/admin/engineering/knowledge"
          description="唯讀呈現 AI 的療程、需求分流、FAQ、價格與安全規則；不顯示環境變數、金鑰或客人資料。"
          eyebrow="工程專用"
          staff={staff}
          title="AI 知識地圖"
        />
        <p style={{ color: "#60736d", fontSize: 13, lineHeight: 1.6, margin: "0 0 18px" }}>
          基線資料讀自版本控制的設定與 CSV；正式回覆若有已發布的 Runtime Content，請一併至「正式回覆發布」查看。
          本頁載入時間：{new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Taipei" }).format(now)}。
        </p>
        <KnowledgeMapClient entries={entries} />
      </div>
    </main>
  );
}
