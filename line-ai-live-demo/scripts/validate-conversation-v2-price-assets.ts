import assert from "node:assert/strict";

import { createStaticClinicFactsProvider, resolveApprovedPrice } from "../src/lib/clinic-facts";
import { hydrateConversationV2ReplyPlan } from "../src/lib/conversation-v2/hydrate-reply-plan";
import { evaluateDialoguePolicy } from "../src/lib/conversation-v2/policy";
import { createConversationV2State } from "../src/lib/conversation-v2/state";
import type { DialoguePolicyResult, TurnUnderstanding } from "../src/lib/conversation-v2/types";
import { renderReplyPlan } from "../src/lib/reply-renderer";
import type { DialogueState } from "../src/lib/dialogue-state";
import { loadSeedData } from "../src/lib/seed-loader";

const NOW = "2026-09-15T04:00:00.000Z";
const ASSET_BASE_URL = "https://line-ai-live-demo.vercel.app/demo/promotions/anniversary-2026/";

function turn(
  treatmentKey: string,
  text: string,
  turnId: string,
  priceApplicability?: TurnUnderstanding["priceApplicability"],
): TurnUnderstanding {
  return {
    areas: [],
    concerns: [],
    confidence: 1,
    conversationMove: "start",
    dialogueReference: "explicit",
    questionAspect: "price_campaign",
    ...(priceApplicability ? { priceApplicability } : {}),
    receivedAt: NOW,
    speechAct: "ask_price",
    text,
    treatments: [{ confidence: 1, key: treatmentKey, polarity: "affirmed", resolution: "resolved" }],
    turnId,
  };
}

function rendererDialogueState(treatmentKey: string): DialogueState {
  return {
    answeredTopics: [],
    areaKeys: [],
    bookingAction: null,
    bookingIntent: "none",
    concernKeys: [],
    dialogueAct: "quote_approved_price",
    episodeId: `price-assets-${treatmentKey}`,
    handoffStatus: "ai_active",
    knownNeeds: [],
    lastTransitionAt: NOW,
    schemaVersion: 1,
    topic: "treatment",
    treatmentKeys: [treatmentKey],
  };
}

async function hydratePrice(input: {
  campaignId?: string;
  footer?: string;
  includeFooter?: boolean;
  priceApplicability?: TurnUnderstanding["priceApplicability"];
  pricingCampaigns?: Awaited<ReturnType<typeof loadSeedData>>["pricingCampaigns"];
  text: string;
  treatmentKey: string;
  turnId: string;
}) {
  const { pricingCampaigns } = await loadSeedData();
  const snapshot = await createStaticClinicFactsProvider({
    pricingCampaigns: input.pricingCampaigns ?? pricingCampaigns,
  }).loadSnapshot({ now: new Date(NOW) });
  const state = createConversationV2State({ episodeId: `price-assets-${input.turnId}`, now: NOW });
  const understanding = turn(
    input.treatmentKey,
    input.text,
    input.turnId,
    input.priceApplicability,
  );
  const policy = evaluateDialoguePolicy(state, understanding);
  assert.equal(policy.action.type, "answer_price", `${input.turnId}: policy must enter the V2 price path`);
  assert.equal(policy.replyPlan.mode, "deterministic", `${input.turnId}: price reply must be deterministic`);
  assert.equal(policy.replyPlan.dialogueAct, "answer_price", `${input.turnId}: price reply plan must be selected`);
  const result: DialoguePolicyResult = input.campaignId
    ? {
        ...policy,
        replyPlan: {
          ...policy.replyPlan,
          pricingQuery: {
            ...policy.replyPlan.pricingQuery!,
            campaignId: input.campaignId,
          },
        },
      }
    : policy;
  const hydrated = await hydrateConversationV2ReplyPlan({
    nextState: state,
    result,
    snapshot,
    turn: understanding,
  });
  const rendererPlan = hydrated.rendererPlan;
  assert(rendererPlan, `${input.turnId}: V2 price must hydrate a renderer plan`);
  const rendered = await renderReplyPlan({
    customerMessage: input.text,
    dialogueState: rendererDialogueState(input.treatmentKey),
    footer: input.footer,
    includeFooter: input.includeFooter ?? false,
    plan: rendererPlan,
    recentTurns: [],
  });
  return { ...hydrated, rendererPlan, rendered, snapshot };
}

async function main() {
  const checks: string[] = [];

  const onda = await hydratePrice({
    text: "ONDA 現在活動價多少？",
    treatmentKey: "onda_pro",
    turnId: "v2-price-assets-onda",
  });
  assert.equal(onda.priceResolution?.status, "approved_current");
  assert.equal(onda.priceResolution?.campaignId, "promo-2026-anniv-onda-face-online");
  assert.deepEqual(onda.priceResolution.customerAssetUrls, [`${ASSET_BASE_URL}onda-face-12min-8999.jpg`]);
  assert.deepEqual(onda.rendererPlan.richMessages.map((message) => message.type), ["image", "text"]);
  assert.deepEqual(onda.rendered.messages.map((message) => message.type), ["image", "text"]);
  assert.equal(onda.rendered.messages[0]?.type, "image");
  assert.equal(onda.rendered.messages[0]?.originalContentUrl, `${ASSET_BASE_URL}onda-face-12min-8999.jpg`);
  assert.match(onda.rendered.messages[1]?.type === "text" ? onda.rendered.messages[1].text : "", /8,999/u);
  checks.push("generic-onda-8999-hydrates-approved-image-before-text");

  const botox = await hydratePrice({
    text: "肉毒目前活動價多少？",
    treatmentKey: "botox",
    turnId: "v2-price-assets-botox",
  });
  assert.equal(botox.priceResolution?.status, "approved_current");
  assert.equal(botox.priceResolution?.campaignId, "promo-2026-anniv-botox-10u");
  assert.deepEqual(botox.priceResolution.customerAssetUrls, [`${ASSET_BASE_URL}botox-wrinkle-999.jpg`]);
  assert.deepEqual(botox.rendered.messages.map((message) => message.type), ["image", "text"]);
  assert.equal(botox.rendered.messages[0]?.type, "image");
  assert.equal(botox.rendered.messages[0]?.originalContentUrl, `${ASSET_BASE_URL}botox-wrinkle-999.jpg`);
  checks.push("generic-botox-999-hydrates-approved-image-before-text");

  // A price campaign must be able to remain text-only: asset URLs are optional
  // receipt metadata, not a precondition to quote a clinic-approved offer.
  const ondaWithoutArtwork = (await loadSeedData()).pricingCampaigns.map((campaign) =>
    campaign.id === "promo-2026-anniv-onda-face-online"
      ? { ...campaign, asset_urls: "" }
      : campaign,
  );
  const textOnly = await hydratePrice({
    text: "ONDA 現在活動價多少？",
    treatmentKey: "onda_pro",
    turnId: "v2-price-assets-approved-without-artwork",
    pricingCampaigns: ondaWithoutArtwork,
  });
  assert.equal(textOnly.priceResolution?.status, "approved_current");
  assert.equal(textOnly.priceResolution?.campaignId, "promo-2026-anniv-onda-face-online");
  assert.deepEqual(textOnly.priceResolution.customerAssetUrls, [], "approved offer without artwork must not synthesize media");
  assert.deepEqual(textOnly.rendererPlan.richMessages.map((message) => message.type), ["text"]);
  assert.deepEqual(textOnly.rendered.messages.map((message) => message.type), ["text"]);
  checks.push("approved-price-without-specific-artwork-stays-text-only");

  const unsafePricingCampaigns = (await loadSeedData()).pricingCampaigns.map((campaign) =>
    campaign.id === "promo-2026-anniv-onda-face-online"
      ? {
          ...campaign,
          asset_urls: [
            "javascript:alert(1)",
            "http://unsafe.example/onda.jpg",
            "https://user:password@unsafe.example/onda.jpg",
            "https://safe.example/onda.jpg",
          ].join("|"),
        }
      : campaign,
  );
  const unsafeSnapshot = await createStaticClinicFactsProvider({
    pricingCampaigns: unsafePricingCampaigns,
  }).loadSnapshot({ now: new Date(NOW) });
  const unsafeAsset = resolveApprovedPrice(unsafeSnapshot, {
    campaignId: "promo-2026-anniv-onda-face-online",
    kind: "campaign",
    treatmentKeys: ["onda_pro"],
  });
  assert.equal(unsafeAsset.status, "approved_current");
  assert.deepEqual(
    unsafeAsset.customerAssetUrls,
    ["https://safe.example/onda.jpg"],
    "only credential-free HTTPS campaign assets may enter the customer receipt",
  );
  checks.push("resolved-price-receipt-exposes-only-validated-campaign-assets");

  const fourArtworkUrls = [1, 2, 3, 4]
    .map((index) => `https://safe.example/onda-${index}.jpg`)
    .join("|");
  const fourArtworkCampaigns = (await loadSeedData()).pricingCampaigns.map((campaign) =>
    campaign.id === "promo-2026-anniv-onda-face-online"
      ? { ...campaign, asset_urls: fourArtworkUrls }
      : campaign,
  );
  const withFooter = await hydratePrice({
    footer: "以上為 AI 客服順順初步回覆。",
    includeFooter: true,
    pricingCampaigns: fourArtworkCampaigns,
    text: "ONDA 現在活動價多少？",
    treatmentKey: "onda_pro",
    turnId: "v2-price-assets-line-message-limit",
  });
  assert.equal(withFooter.rendered.messages.length, 5, "four images + canonical price/footer text must stay within LINE's five-message limit");
  assert.deepEqual(withFooter.rendered.messages.slice(0, 4).map((message) => message.type), ["image", "image", "image", "image"]);
  const finalMessage = withFooter.rendered.messages[4];
  assert(finalMessage?.type === "text", "the fifth LINE message must contain canonical price text");
  assert.match(finalMessage.text, /8,999/u);
  assert.match(finalMessage.text, /以上為 AI 客服順順初步回覆/u);
  checks.push("approved-price-artwork-and-footer-stay-within-line-five-message-limit");

  console.log(JSON.stringify({ checks, passed: checks.length, total: checks.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
