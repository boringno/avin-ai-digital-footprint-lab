import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { runDailyRollup } = await import("../src/lib/reporting-rollup");
  const args = new Set(process.argv.slice(2));
  const metricDate = process.argv.find((value) => value.startsWith("--date="))?.slice("--date=".length);
  const result = await runDailyRollup({ dryRun: args.has("--dry-run"), metricDate });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
