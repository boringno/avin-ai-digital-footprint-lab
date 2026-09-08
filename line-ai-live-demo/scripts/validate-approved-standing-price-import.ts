import assert from "node:assert/strict";

import {
  APPROVED_STANDING_PRICE_IMPORT_EXCLUSIONS,
  APPROVED_STANDING_PRICE_IMPORT_ROWS,
  approvedStandingPriceDrafts,
  standingPriceImportSummary,
  toStandingPriceDraft,
} from "../src/lib/approved-standing-price-import";
import { clinicConfig } from "../src/lib/clinic-config";
import { loadClinicFactsSnapshot } from "../src/lib/clinic-facts/provider";
import { resolveApprovedPrice } from "../src/lib/clinic-facts/price-resolver";
import { createStaticClinicFactsProvider } from "../src/lib/clinic-facts/static-provider";
import { toPricingCampaign } from "../src/lib/runtime-content-release";
import { loadSeedData } from "../src/lib/seed-loader";

const NOW = new Date("2026-09-06T12:00:00+08:00");

const excluded = new Set([
  "clinic_price_pdf_20260831__onda_pro__2060573",
  "clinic_price_pdf_20260831__butterfly_forma_rf__no_online_quote",
  "clinic_price_pdf_20260831__ultherapy__no_online_quote",
  "clinic_price_pdf_20260831__ilib__2050241",
  "clinic_price_pdf_20260831__ilib__2050274",
]);

async function main() {
  const keys = APPROVED_STANDING_PRICE_IMPORT_ROWS.map((row) => row.offerKey);
  assert.equal(APPROVED_STANDING_PRICE_IMPORT_ROWS.length, 62, "must stage every safe approved Notion price row");
  assert.equal(new Set(keys).size, keys.length, "offer keys must be unique");
  assert.ok(keys.every((key) => !excluded.has(key) && !key.startsWith("draft:")), "blocked rows cannot be staged");
  assert.equal(
    APPROVED_STANDING_PRICE_IMPORT_EXCLUSIONS.reduce((sum, entry) => sum + entry.count, 0),
    10,
    "preview must disclose every intentionally excluded source row",
  );

  for (const row of APPROVED_STANDING_PRICE_IMPORT_ROWS) {
    assert.ok(
      clinicConfig.treatmentList.some((treatment) => treatment.key === row.treatmentKey),
      `missing clinic treatment mapping for ${row.offerKey}`,
    );
    const draft = toStandingPriceDraft(row);
    assert.equal(draft.contentType, "campaign");
    assert.equal(draft.startAt, null);
    assert.equal(draft.endAt, null);
    assert.equal(draft.payload.pricing_kind, "standing");
    assert.equal(draft.payload.customer_price_text, row.customerPriceText);
    assert.ok(Array.isArray(draft.payload.booking_treatments));
    assert.ok(Array.isArray(draft.payload.aliases), `${row.offerKey} must store aliases in the Runtime-consumed field`);
    assert.ok(!("campaign_aliases" in draft.payload), `${row.offerKey} cannot use the legacy output-only alias field`);
  }

  const runtimeCampaigns = approvedStandingPriceDrafts().map((draft) => toPricingCampaign({
    content_key: draft.contentKey,
    content_type: "campaign",
    end_at: draft.endAt,
    payload_json: draft.payload,
    start_at: draft.startAt,
  }));
  assert.equal(runtimeCampaigns.length, 62);
  const classicBotox = runtimeCampaigns.find((campaign) => campaign.id.includes("botox_classic_brand"));
  const neuronox = runtimeCampaigns.find((campaign) => campaign.id.includes("neuronox_brand"));
  const emface = runtimeCampaigns.find((campaign) => campaign.id.includes("__emface__"));
  assert.match(classicBotox?.campaign_aliases ?? "", /BOTOX.*經典肉毒/u, "BOTOX aliases must survive draft -> Runtime conversion");
  assert.match(neuronox?.campaign_aliases ?? "", /Neuronox.*優力柔/u, "Neuronox aliases must survive draft -> Runtime conversion");
  assert.equal(emface?.branch_scope, "全館", "EMFACE 19,999 is a unified public standing price");

  const standingSnapshot = await loadClinicFactsSnapshot(
    createStaticClinicFactsProvider({ pricingCampaigns: runtimeCampaigns }),
    { now: NOW, tenantId: "tenant_001" },
  );
  assertApprovedPrice(standingSnapshot, "botox", "1,999", { dose: "12U", variant: "botox_classic" });
  assertApprovedPrice(standingSnapshot, "botox", "1,499", { variant: "neuronox" });
  assertApprovedPrice(standingSnapshot, "botox", "1,799", { variant: "dysport" });
  assertApprovedPrice(standingSnapshot, "pelvic_floor_chair", "3,999", { branch: "台中館" });
  assertApprovedPrice(standingSnapshot, "emface", "19,999", {});
  assertApprovedPrice(standingSnapshot, "fisbo", "19,999", {});
  assertApprovedPrice(standingSnapshot, "vivabella", "23,999", { variant: "50mg" });
  assertApprovedPrice(standingSnapshot, "vivabella", "23,999", { variant: "200mg" });
  for (const branch of ["高雄館", "桃園館", "林口館"]) {
    const resolution = resolveApprovedPrice(standingSnapshot, {
      applicability: { branch },
      kind: "unspecified",
      treatmentKeys: ["emface"],
    });
    assert.equal(resolution.status, "approved_current", `EMFACE 19,999 must stay publicly visible for ${branch} customers`);
  }

  const seed = await loadSeedData();
  const anniversarySnapshot = await loadClinicFactsSnapshot(
    createStaticClinicFactsProvider({ pricingCampaigns: [...seed.pricingCampaigns, ...runtimeCampaigns] }),
    { now: NOW, tenantId: "tenant_001" },
  );
  const genericBotox = resolveApprovedPrice(anniversarySnapshot, {
    kind: "unspecified",
    treatmentKeys: ["botox"],
  });
  assert.equal(genericBotox.status, "approved_current", "current anniversary Botox offer must remain quoteable");
  if (genericBotox.status === "approved_current") {
    assert.match(genericBotox.customerPriceText, /999/u, "anniversary Botox 999 must beat lower-priority standing offers");
    assert.match(genericBotox.campaignId, /anniv/u, "generic Botox must be owned by the active anniversary campaign");
  }

  const summary = standingPriceImportSummary();
  assert.equal(summary.candidates, 62);
  assert.ok(summary.treatmentCount >= 30, "import must cover a broad clinic catalog, not only ONDA/Botox");

  console.log(JSON.stringify({
    candidates: summary.candidates,
    runtimeResolverCases: 12,
    treatmentCount: summary.treatmentCount,
    passed: true,
  }, null, 2));
}

function assertApprovedPrice(
  snapshot: Awaited<ReturnType<typeof loadClinicFactsSnapshot>>,
  treatmentKey: string,
  expectedAmount: string,
  applicability: { branch?: string; dose?: string; variant?: string },
) {
  const resolution = resolveApprovedPrice(snapshot, {
    applicability,
    kind: "unspecified",
    treatmentKeys: [treatmentKey],
  });
  assert.equal(resolution.status, "approved_current", `${treatmentKey} ${JSON.stringify(applicability)} must resolve`);
  if (resolution.status === "approved_current") {
    assert.match(resolution.customerPriceText, new RegExp(expectedAmount.replace(",", "[,]?"), "u"));
  }
}

void main();
