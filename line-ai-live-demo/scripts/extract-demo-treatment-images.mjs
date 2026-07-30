import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

const input = process.argv[2];

if (!input) {
  console.error("Usage: node scripts/extract-demo-treatment-images.mjs <screenshot-path>");
  process.exit(1);
}

const outDir = path.resolve("public/demo/treatments");
fs.mkdirSync(outDir, { recursive: true });

const cards = [
  { name: "underarm-hair-removal", left: 0, top: 15, width: 376, height: 242 },
  { name: "hydrafacial", left: 387, top: 15, width: 376, height: 242 },
  { name: "botox-wrinkle", left: 774, top: 15, width: 376, height: 242 },
  { name: "mandelic-pore-care", left: 1160, top: 15, width: 375, height: 242 },
];

async function createCard(card) {
  const cropBuffer = await sharp(input)
    .extract({ left: card.left, top: card.top, width: card.width, height: card.height })
    .png()
    .toBuffer();

  const logoCover = await sharp(cropBuffer)
    .extract({ left: 0, top: 0, width: 170, height: 58 })
    .blur(18)
    .modulate({ brightness: 1.08, saturation: 1.05 })
    .png()
    .toBuffer();

  const output = path.join(outDir, `${card.name}.webp`);
  await sharp(cropBuffer)
    .composite([{ input: logoCover, left: 0, top: 0 }])
    .resize(1040, 670, { fit: "cover" })
    .webp({ quality: 88 })
    .toFile(output);

  return output;
}

const outputs = [];
for (const card of cards) {
  outputs.push(await createCard(card));
}

console.log(outputs.join("\n"));
