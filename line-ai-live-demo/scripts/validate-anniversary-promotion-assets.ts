import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildPromotionCarouselMessage, PROMOTION_CARD_ASPECT_RATIO } from "../src/lib/promotion-carousel";
import { routeCustomerMessage } from "../src/lib/router";
import { loadSeedData, type PricingCampaign } from "../src/lib/seed-loader";

const ASSET_BASE_URL = "https://line-ai-live-demo.vercel.app/demo/promotions/anniversary-2026/";
const ASSET_DIRECTORY = path.join(process.cwd(), "public", "demo", "promotions", "anniversary-2026");
const LANDSCAPE_RATIO = "20:13";
const MAX_LINE_IMAGE_BYTES = 1_000_000;
const MAX_LINE_IMAGE_EDGE = 1024;

const mappedAssets: Record<string, string> = {
  "promo-2026-anniv-vio": "vio-private-removal-1099.jpg",
  "promo-2026-anniv-underarm": "underarm-removal-499.jpg",
  "promo-2026-anniv-botox-10u": "botox-wrinkle-999.jpg",
  "promo-2026-anniv-pico-honeycomb": "pico-honeycomb-3999.jpg",
  "promo-2026-anniv-tenthermage-eye-300": "tenthermage-eye-300-18888.jpg",
  "promo-2026-anniv-tenthermage-200": "tenthermage-200-8999.jpg",
  "promo-2026-anniv-qplus-200": "qplus-ultrasound-200-7999.jpg",
  "promo-2026-anniv-ultherapy-200-botox40": "ultherapy-200-botox-29999.jpg",
  "promo-2026-anniv-onda-face-online": "onda-face-12min-8999.jpg",
  "promo-2026-anniv-beienxi-1cc": "beienxi-1cc-5999.jpg",
  "promo-2026-anniv-powder-glow": "powder-glow-11999.jpg",
};

const unmappedCampaignIds = [
  "promo-2026-anniv-botox-100u",
  "promo-2026-anniv-tenthermage-900-teosyal1",
  "promo-2026-anniv-ultherapy-500-botox100",
  "promo-2026-anniv-ultherapy-1000-botox200-onda",
  "promo-2026-anniv-onda-face-extension",
  "promo-2026-anniv-teosyal1",
  "promo-2026-anniv-teosyal2-4",
  "promo-2026-anniv-ailewei",
];

function imageDimensions(filePath: string) {
  const bytes = fs.readFileSync(filePath);
  assert(bytes[0] === 0xff && bytes[1] === 0xd8, `${path.basename(filePath)} must be a JPEG asset`);

  for (let offset = 2; offset + 9 < bytes.length;) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xd8 || marker === 0xd9) continue;
    const segmentLength = bytes.readUInt16BE(offset);
    assert(segmentLength >= 2, `invalid JPEG segment in ${path.basename(filePath)}`);
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return {
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5),
      };
    }
    offset += segmentLength;
  }

  throw new Error(`cannot determine JPEG dimensions: ${path.basename(filePath)}`);
}

function runtimeOverlay(pricingCampaigns: PricingCampaign[]) {
  return {
    faqEntries: [],
    pricingCampaigns,
    releaseId: "validate-anniversary-assets",
    sourceStatus: "available" as const,
    suppressedPricingCampaignIds: [],
  };
}

async function main() {
  const checks: string[] = [];
  const { pricingCampaigns } = await loadSeedData();
  const campaignsById = new Map(pricingCampaigns.map((campaign) => [campaign.id, campaign]));

  for (const [campaignId, fileName] of Object.entries(mappedAssets)) {
    const campaign = campaignsById.get(campaignId);
    assert(campaign, `missing mapped anniversary campaign: ${campaignId}`);
    assert.equal(campaign.asset_urls, `${ASSET_BASE_URL}${fileName}`, `${campaignId} must point to its exact campaign artwork`);

    const filePath = path.join(ASSET_DIRECTORY, fileName);
    const stats = fs.statSync(filePath);
    const dimensions = imageDimensions(filePath);
    assert(stats.size <= MAX_LINE_IMAGE_BYTES, `${fileName} exceeds LINE's 1 MB preview-image limit`);
    assert(dimensions.width <= MAX_LINE_IMAGE_EDGE && dimensions.height <= MAX_LINE_IMAGE_EDGE, `${fileName} exceeds LINE's 1024px image edge limit`);
    assert(Math.abs(dimensions.width / dimensions.height - 20 / 13) < 0.03, `${fileName} must preserve the 20:13 landscape visual contract`);
  }
  checks.push("mapped-anniversary-artwork-is-line-safe-and-landscape");

  for (const campaignId of unmappedCampaignIds) {
    const campaign = campaignsById.get(campaignId);
    assert(campaign, `missing unmapped anniversary campaign: ${campaignId}`);
    assert.equal(campaign.asset_urls, "", `${campaignId} must remain text-only without a specific campaign graphic`);
  }
  checks.push("campaigns-without-specific-artwork-stay-unmapped");

  const mappedCampaign = campaignsById.get("promo-2026-anniv-onda-face-online")!;
  const unmappedCampaign = campaignsById.get("promo-2026-anniv-onda-face-extension")!;
  const now = new Date("2026-09-15T04:00:00.000Z");
  const carouselDecision = await routeCustomerMessage({
    includePending: true,
    message: "目前活動有哪些",
    now,
    runtimeContentOverlay: runtimeOverlay([mappedCampaign, unmappedCampaign]),
  });
  assert.equal(carouselDecision.replyMessages?.[0]?.type, "flex", "a mapped anniversary campaign must emit a promotion carousel");
  const routedCarousel = carouselDecision.replyMessages?.[0];
  assert(routedCarousel?.type === "flex", "mapped anniversary reply must be a flex carousel");
  const routedHero = (
    routedCarousel.contents as { contents: Array<{ hero: { aspectRatio: string } }> }
  ).contents[0]?.hero;
  assert.equal(
    routedHero?.aspectRatio,
    LANDSCAPE_RATIO,
    "the actual router carousel must preserve anniversary landscape artwork",
  );

  const textOnlyDecision = await routeCustomerMessage({
    includePending: true,
    message: "目前活動有哪些",
    now,
    runtimeContentOverlay: runtimeOverlay([unmappedCampaign]),
  });
  assert.equal(textOnlyDecision.replyMessages, undefined, "an unmapped campaign must remain text-only");
  checks.push("router-emits-carousel-only-when-specific-artwork-exists");

  const anniversaryFlex = buildPromotionCarouselMessage([{
    aspectRatio: LANDSCAPE_RATIO,
    ctaLabel: "我想了解",
    ctaText: "我想了解ONDA活動",
    imageUrl: mappedCampaign.asset_urls,
    title: "ONDA PRO",
  }]);
  const legacyFlex = buildPromotionCarouselMessage([{
    ctaLabel: "我想了解",
    ctaText: "我想了解舊活動",
    imageUrl: "https://line-ai-live-demo.vercel.app/demo/promotions/summer-2026-07-09-to-07-20/botox-wrinkle-999.png",
    title: "肉毒",
  }]);
  const anniversaryHero = (anniversaryFlex.contents as { contents: Array<{ hero: { aspectRatio: string } }> }).contents[0].hero;
  const legacyHero = (legacyFlex.contents as { contents: Array<{ hero: { aspectRatio: string } }> }).contents[0].hero;
  assert.equal(anniversaryHero.aspectRatio, LANDSCAPE_RATIO, "anniversary cards must preserve their landscape ratio");
  assert.equal(legacyHero.aspectRatio, PROMOTION_CARD_ASPECT_RATIO, "legacy portrait cards must retain their existing ratio");
  checks.push("per-card-ratio-preserves-landscape-and-legacy-portrait-artwork");

  console.log(JSON.stringify({ checks, passed: checks.length, total: checks.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
