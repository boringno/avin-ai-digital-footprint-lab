import type { LineFlexMessage } from "@/lib/treatment-carousel";

export type PromotionCarouselCard = {
  /**
   * Optional per-card ratio. Anniversary campaign artwork is landscape; older
   * portrait promotion artwork intentionally continues to use the default.
   */
  aspectRatio?: string;
  ctaLabel: string;
  ctaText: string;
  imageUrl: string;
  priceText?: string;
  subtitle?: string;
  title: string;
};

export const PROMOTION_CARD_ASPECT_RATIO = "31:50";

export function buildPromotionCarouselMessage(
  cards: PromotionCarouselCard[],
  altText = "目前活動優惠",
) {
  return {
    type: "flex",
    altText,
    contents: {
      type: "carousel",
      contents: cards.slice(0, 10).map((card) => ({
        type: "bubble",
        size: "mega",
        hero: {
          type: "image",
          url: card.imageUrl,
          size: "full",
          aspectRatio: card.aspectRatio ?? PROMOTION_CARD_ASPECT_RATIO,
          aspectMode: "cover",
          action: {
            type: "message",
            label: card.ctaLabel,
            text: card.ctaText,
          },
        },
      })),
    },
  } satisfies LineFlexMessage;
}
