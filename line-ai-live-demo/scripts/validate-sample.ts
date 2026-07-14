import path from "node:path";
import { readFile } from "node:fs/promises";

import { processWebhookRequestBody } from "../src/lib/line-webhook";

async function main() {
  const payloadPath = path.resolve(process.cwd(), "./data/live-demo-seed/sample_line_webhook_payload.json");
  const rawBody = await readFile(payloadPath, "utf8");

  const result = await processWebhookRequestBody(rawBody, {
    includePending: false,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
