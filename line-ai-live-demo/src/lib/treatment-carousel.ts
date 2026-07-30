export type LineTextMessage = {
  text: string;
  type: "text";
};

export type LineImageMessage = {
  originalContentUrl: string;
  previewImageUrl: string;
  type: "image";
};

export type LineTemplateImageCarouselMessage = {
  altText: string;
  template: {
    columns: Array<{
      action: {
        label: string;
        text: string;
        type: "message";
      };
      imageUrl: string;
    }>;
    type: "image_carousel";
  };
  type: "template";
};

type LineFlexText = {
  color?: string;
  margin?: string;
  size?: string;
  text: string;
  type: "text";
  weight?: "bold" | "regular";
  wrap?: boolean;
};

type LineFlexImage = {
  action?: {
    label?: string;
    text?: string;
    type: "message" | "uri";
    uri?: string;
  };
  aspectMode?: "cover" | "fit";
  aspectRatio?: string;
  size?: "full" | "xxl" | "xl" | "lg" | "md" | "sm" | "xs" | "xxs";
  type: "image";
  url: string;
};

type LineFlexBox = {
  contents: Array<LineFlexBox | LineFlexImage | LineFlexText>;
  layout: "vertical";
  paddingAll?: string;
  spacing?: string;
  type: "box";
};

type LineFlexButton = {
  action: {
    label: string;
    text: string;
    type: "message";
  };
  height?: string;
  style?: "link" | "primary" | "secondary";
  type: "button";
};

type LineFlexBubble = {
  body?: LineFlexBox;
  footer?: {
    contents: LineFlexButton[];
    layout: "vertical";
    spacing?: string;
    type: "box";
  };
  hero?: {
    action?: {
      label?: string;
      text?: string;
      type: "message" | "uri";
      uri?: string;
    };
    aspectMode: "cover";
    aspectRatio: string;
    size: "full";
    type: "image";
    url: string;
  };
  size?: "kilo" | "mega" | "micro" | "nano";
  type: "bubble";
};

export type LineFlexMessage = {
  altText: string;
  contents: {
    contents: LineFlexBubble[];
    type: "carousel";
  };
  type: "flex";
};

export type LineReplyMessage = LineFlexMessage | LineImageMessage | LineTemplateImageCarouselMessage | LineTextMessage;

export type PromotionCarouselCard = {
  ctaLabel: string;
  ctaText: string;
  imageUrl: string;
  priceText?: string;
  subtitle?: string;
  title: string;
};

type TreatmentCarouselCard = {
  body: string[];
  ctaLabel: string;
  ctaText: string;
  eyebrow: string;
  imageUrl: string;
  priceText?: string;
  title: string;
};

const TREATMENT_CAROUSEL_TRIGGER_TERMS = [
  "熱門療程",
  "活動療程",
  "有什麼療程",
  "有哪些療程",
  "想了解療程",
  "可以做什麼療程",
  "推薦療程",
  "療程介紹",
  "療程列表",
  "夏日",
  "盛夏光采",
];

const TREATMENT_CAROUSEL_CARDS: TreatmentCarouselCard[] = [
  {
    body: ["夏日必備", "適合小黑頭、毛髮與暗沉困擾", "療程快速，通常不需敷麻"],
    ctaLabel: "了解除毛",
    ctaText: "我想了解腋下除毛",
    eyebrow: "清爽管理",
    imageUrl: "https://line-ai-live-demo.vercel.app/demo/treatments/underarm-hair-removal.webp",
    priceText: "活動參考 499",
    title: "腋下除毛",
  },
  {
    body: ["深層清潔、補水修護與溫和代謝", "偏向非侵入式保養流程", "適合想先做日常膚況整理的客人"],
    ctaLabel: "了解水飛梭",
    ctaText: "我想了解水飛梭",
    eyebrow: "肌膚保養",
    imageUrl: "https://line-ai-live-demo.vercel.app/demo/treatments/hydrafacial.webp",
    priceText: "活動參考 999",
    title: "水飛梭",
  },
  {
    body: ["常見用於動態紋、咀嚼肌與局部肌肉放鬆方向", "實際品牌、劑量與部位需由醫師評估", "可先協助整理想改善的部位"],
    ctaLabel: "了解肉毒",
    ctaText: "我想了解肉毒",
    eyebrow: "針劑評估",
    imageUrl: "https://line-ai-live-demo.vercel.app/demo/treatments/botox-wrinkle.webp",
    priceText: "活動參考 999",
    title: "肉毒除皺",
  },
  {
    body: ["偏向代謝角質、粉刺油脂與毛孔清潔管理", "實際是否適合會依膚況判斷", "敏感、術後或孕哺請先告知客服"],
    ctaLabel: "了解杏仁酸",
    ctaText: "我想了解杏仁酸毛孔管理",
    eyebrow: "毛孔管理",
    imageUrl: "https://line-ai-live-demo.vercel.app/demo/treatments/mandelic-pore-care.webp",
    priceText: "活動參考 999",
    title: "杏仁酸 + 毛孔管理",
  },
];

function normalizeText(text: string) {
  return text.replace(/\s+/g, "").trim().toLowerCase();
}

export function isTreatmentCarouselRequest(message: string) {
  const normalizedMessage = normalizeText(message);
  if (normalizedMessage === "療程") {
    return true;
  }
  return TREATMENT_CAROUSEL_TRIGGER_TERMS.some((term) => normalizedMessage.includes(normalizeText(term)));
}

function buildCard(card: TreatmentCarouselCard): LineFlexBubble {
  return {
    type: "bubble",
    size: "kilo",
    hero: {
      type: "image",
      url: card.imageUrl,
      size: "full",
      aspectRatio: "20:13",
      aspectMode: "cover",
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        {
          type: "text",
          text: card.eyebrow,
          size: "xs",
          color: "#4F8EA0",
          weight: "bold",
        },
        {
          type: "text",
          text: card.title,
          size: "xl",
          weight: "bold",
          wrap: true,
        },
        ...(card.priceText
          ? [
              {
                type: "text" as const,
                text: card.priceText,
                size: "sm" as const,
                color: "#4F63D7",
                weight: "bold" as const,
                wrap: true,
              },
            ]
          : []),
        ...card.body.map((line) => ({
          type: "text" as const,
          text: `• ${line}`,
          size: "sm" as const,
          color: "#333333",
          wrap: true,
        })),
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        {
          type: "button",
          style: "primary",
          height: "sm",
          action: {
            type: "message",
            label: card.ctaLabel,
            text: card.ctaText,
          },
        },
      ],
    },
  };
}

export function buildTreatmentCarouselMessage(): LineFlexMessage {
  return {
    type: "flex",
    altText: "熱門療程資訊",
    contents: {
      type: "carousel",
      contents: TREATMENT_CAROUSEL_CARDS.map(buildCard),
    },
  };
}

export function getTreatmentCarouselReplyText() {
  return "已為您整理熱門療程卡片，可左右滑動查看。價格與適合度仍需依活動期間、館別、部位與現場評估為準。";
}
