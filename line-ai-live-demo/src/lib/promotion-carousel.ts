import type { LineFlexMessage } from "@/lib/treatment-carousel";

export type PromotionCarouselCard = {
  /**
   * Optional per-card ratio. Anniversary campaign artwork is landscape; older
   * portrait promotion artwork intentionally continues to use the default.
   */
  aspectRatio?: string;
  ctaLabel: string;
  ctaText: string;
  imageUrl?: string;
  priceText?: string;
  subtitle?: string;
  title: string;
};

export const PROMOTION_CARD_ASPECT_RATIO = "31:50";
export const PROMOTION_CAROUSEL_PAGE_SIZE = 10;

function buildPromotionCarouselCard(card: PromotionCarouselCard) {
  const imageUrl = card.imageUrl?.trim();
  const bodyContents = [
    {
      type: "text" as const,
      text: card.title,
      weight: "bold" as const,
      size: "lg",
      wrap: true,
    },
    ...(card.subtitle
      ? [{ type: "text" as const, text: card.subtitle, size: "sm", color: "#666666", wrap: true }]
      : []),
    ...(card.priceText
      ? [{ type: "text" as const, text: card.priceText, weight: "bold" as const, size: "md", color: "#C44569", wrap: true }]
      : []),
  ];

  return {
    type: "bubble" as const,
    size: "mega" as const,
    ...(imageUrl
      ? {
          hero: {
            type: "image" as const,
            url: imageUrl,
            size: "full" as const,
            aspectRatio: card.aspectRatio ?? PROMOTION_CARD_ASPECT_RATIO,
            aspectMode: "cover" as const,
            action: {
              type: "message" as const,
              label: card.ctaLabel,
              text: card.ctaText,
            },
          },
        }
      : {}),
    body: {
      type: "box" as const,
      layout: "vertical" as const,
      spacing: "sm",
      contents: bodyContents,
    },
    footer: {
      type: "box" as const,
      layout: "vertical" as const,
      contents: [{
        type: "button" as const,
        style: "primary" as const,
        action: {
          type: "message" as const,
          label: card.ctaLabel,
          text: card.ctaText,
        },
      }],
    },
  };
}

function buildPromotionCarouselPage(
  cards: PromotionCarouselCard[],
  altText: string,
): LineFlexMessage {
  return {
    type: "flex",
    altText,
    contents: {
      type: "carousel",
      contents: cards.map(buildPromotionCarouselCard),
    },
  };
}

export function buildPromotionCarouselMessage(
  cards: PromotionCarouselCard[],
  altText = "目前活動優惠",
) {
  return buildPromotionCarouselPage(cards.slice(0, PROMOTION_CAROUSEL_PAGE_SIZE), altText);
}

/**
 * LINE Flex carousels accept at most ten bubbles.  Keep every approved campaign
 * reachable by splitting a larger catalog into multiple reply messages.
 */
export function buildPromotionCarouselMessages(
  cards: PromotionCarouselCard[],
  altText = "目前活動優惠",
): LineFlexMessage[] {
  if (cards.length === 0) return [];
  const pageCount = Math.ceil(cards.length / PROMOTION_CAROUSEL_PAGE_SIZE);
  return Array.from({ length: pageCount }, (_, pageIndex) => {
    const pageCards = cards.slice(
      pageIndex * PROMOTION_CAROUSEL_PAGE_SIZE,
      (pageIndex + 1) * PROMOTION_CAROUSEL_PAGE_SIZE,
    );
    const pageAltText = pageCount === 1
      ? altText
      : `${altText}（${pageIndex + 1}/${pageCount}）`;
    return buildPromotionCarouselPage(pageCards, pageAltText);
  });
}
