import fs from "node:fs/promises";
import path from "node:path";

import { parse } from "csv-parse/sync";

import {
  EMBEDDED_FAQ_ENTRIES,
  EMBEDDED_HANDOFF_RULES,
  EMBEDDED_PREGNANCY_RULES,
  EMBEDDED_PRICING_CAMPAIGNS,
} from "@/lib/embedded-seed-data";
import { getRuntimeConfig } from "@/lib/live-demo-config";

export type FaqEntry = {
  answer_text: string;
  approval_status: string;
  is_active: string;
  notes: string;
  question_pattern: string;
  reviewed_at: string;
  topic: string;
};

export type HandoffRule = {
  approval_status: string;
  handoff_message: string;
  is_active: string;
  notes: string;
  pattern: string;
  priority: string;
  reviewed_at: string;
  trigger_type: string;
};

export type PricingCampaign = {
  approval_status: string;
  asset_urls: string;
  branch_scope: string;
  booking_treatments?: string;
  campaign_aliases: string;
  campaign_name: string;
  end_date: string;
  fallback_message: string;
  id: string;
  is_active: string;
  notes: string;
  price_text: string;
  start_date: string;
  starts_booking_intake?: string;
  treatment_name: string;
};

export type PregnancyRule = {
  aliases: string;
  approval_status: string;
  doctor_review_required: string;
  guidance_reply: string;
  is_active: string;
  notes: string;
  pregnant_status: string;
  reviewed_at: string;
  breastfeeding_status: string;
  treatment_name: string;
  trying_to_conceive_status: string;
};

type SeedData = {
  faqEntries: FaqEntry[];
  handoffRules: HandoffRule[];
  pregnancyRules: PregnancyRule[];
  pricingCampaigns: PricingCampaign[];
};

function hasRequiredPricingWindow(row: PricingCampaign) {
  return Boolean(
    row.treatment_name &&
      row.campaign_name &&
      row.start_date &&
      row.end_date,
  );
}

function sanitizePricingCampaigns(rows: PricingCampaign[]) {
  return rows.filter(hasRequiredPricingWindow);
}

async function loadCsv<T>(filePath: string): Promise<T[]> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const normalizedContent = content.replace(/\r\n?/gu, "\n");
    return parse(normalizedContent, {
      bom: true,
      columns: true,
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
    }) as T[];
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function loadSeedData(): Promise<SeedData> {
  const { seedDir } = getRuntimeConfig();
  const faqEntries = await loadCsv<FaqEntry>(path.join(seedDir, "approved_faq_seed.csv"));
  const handoffRules = await loadCsv<HandoffRule>(path.join(seedDir, "approved_handoff_rules_runtime_seed.csv"));
  const pregnancyRules = await loadCsv<PregnancyRule>(path.join(seedDir, "approved_pregnancy_rules_seed.csv"));
  const pricingCampaigns = sanitizePricingCampaigns(
    await loadCsv<PricingCampaign>(path.join(seedDir, "approved_pricing_campaigns_seed.csv")),
  );

  return {
    faqEntries: faqEntries.length > 0 ? faqEntries : EMBEDDED_FAQ_ENTRIES,
    handoffRules: handoffRules.length > 0 ? handoffRules : EMBEDDED_HANDOFF_RULES,
    pregnancyRules: pregnancyRules.length > 0 ? pregnancyRules : EMBEDDED_PREGNANCY_RULES,
    pricingCampaigns: pricingCampaigns.length > 0 ? pricingCampaigns : EMBEDDED_PRICING_CAMPAIGNS,
  };
}

export async function getSeedSummary() {
  const data = await loadSeedData();
  return {
    faqCount: data.faqEntries.length,
    handoffCount: data.handoffRules.length,
    pregnancyRuleCount: data.pregnancyRules.length,
    pricingCount: data.pricingCampaigns.length,
  };
}
