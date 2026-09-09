import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  buildPromotionCarouselMessage,
  buildPromotionCarouselMessages,
  PROMOTION_CARD_ASPECT_RATIO,
} from "../src/lib/promotion-carousel";
import { routeCustomerMessage } from "../src/lib/router";
import { loadSeedData, type PricingCampaign } from "../src/lib/seed-loader";
import { isCustomerVisiblePriceOffer } from "../src/lib/pricing-lifecycle";

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

const nonPublicCampaignIds = [
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

  for (const campaignId of nonPublicCampaignIds) {
    const campaign = campaignsById.get(campaignId);
    assert(campaign, `missing non-public anniversary campaign: ${campaignId}`);
    assert(!isCustomerVisiblePriceOffer(campaign), `${campaignId} must not enter the customer-visible anniversary set`);
  }
  checks.push("non-public-anniversary-campaigns-stay-outside-customer-asset-set");

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

  const nonPublicDecision = await routeCustomerMessage({
    includePending: true,
    message: "目前活動有哪些",
    now,
    runtimeContentOverlay: runtimeOverlay([unmappedCampaign]),
  });
  assert.equal(nonPublicDecision.replyMessages, undefined, "a non-public campaign must not emit customer-facing artwork");
  assert(
    !/11,999/u.test(nonPublicDecision.replyText),
    "a non-public campaign must not emit its internal anniversary price in text",
  );
  checks.push("router-emits-customer-artwork-only-for-public-anniversary-offers");

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

  const textOnlyFlex = buildPromotionCarouselMessage([{
    ctaLabel: "了解活動",
    ctaText: "我想了解粉光瓶活動",
    priceText: "活動價 11,999 元",
    subtitle: "細緻穩膚與膚況評估方向",
    title: "微針超音導賦活粉光瓶",
  }]);
  const textOnlyBubble = textOnlyFlex.contents.contents[0]!;
  assert.equal(textOnlyBubble.hero, undefined, "a text-only campaign must not require a placeholder image");
  assert.deepEqual(
    textOnlyBubble.body?.contents.map((item) => item.type === "text" ? item.text : ""),
    ["微針超音導賦活粉光瓶", "細緻穩膚與膚況評估方向", "活動價 11,999 元"],
    "a campaign without artwork must still show its approved title, description, and customer price",
  );
  assert.equal(textOnlyBubble.footer?.contents[0]?.action.text, "我想了解粉光瓶活動");
  assert.equal(textOnlyBubble.footer?.contents[0]?.action.label, "了解活動");
  checks.push("text-only-campaign-still-renders-copy-price-and-cta");

  const pagedCards = Array.from({ length: 23 }, (_, index) => ({
    ctaLabel: "我想了解",
    ctaText: `我想了解活動 ${index + 1}`,
    priceText: `活動價 ${index + 1} 元`,
    title: `活動 ${index + 1}`,
  }));
  const pagedMessages = buildPromotionCarouselMessages(pagedCards);
  assert.deepEqual(
    pagedMessages.map((message) => message.contents.contents.length),
    [10, 10, 3],
    "campaign catalogs larger than ten cards must be split without dropping any approved campaign",
  );
  assert.deepEqual(
    pagedMessages.map((message) => message.altText),
    ["目前活動優惠（1/3）", "目前活動優惠（2/3）", "目前活動優惠（3/3）"],
  );
  assert.deepEqual(
    pagedMessages.flatMap((message) => message.contents.contents.map((bubble) =>
      bubble.footer?.contents[0]?.action.text,
    )),
    pagedCards.map((card) => card.ctaText),
    "every paginated card must preserve the CTA that identifies its campaign",
  );
  assert.equal(buildPromotionCarouselMessages([]).length, 0, "an empty catalog must not emit an invalid Flex carousel");
  checks.push("large-campaign-catalog-is-paginated-with-stable-ctas");

  console.log(JSON.stringify({ checks, passed: checks.length, total: checks.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
