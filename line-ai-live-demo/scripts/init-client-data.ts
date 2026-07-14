import { clinicConfig } from "../src/lib/clinic-config";
import { loadSeedData } from "../src/lib/seed-loader";

type CheckLevel = "FAIL" | "PASS" | "WARN";

type CheckResult = {
  level: CheckLevel;
  message: string;
};

const results: CheckResult[] = [];
const checkProductionEnv = process.argv.includes("--check-production-env");

function add(level: CheckLevel, message: string) {
  results.push({ level, message });
}

function isPlaceholder(value: string) {
  return /\b(todo|replace|example|placeholder)\b/i.test(value);
}

function hasValue(name: string) {
  return Boolean(process.env[name]?.trim());
}

function validateClinicConfig() {
  if (!clinicConfig.clinicName.trim() || isPlaceholder(clinicConfig.clinicName)) {
    add("FAIL", "clinicConfig.clinicName must be set to a real clinic name.");
  } else {
    add("PASS", "Clinic name is configured.");
  }

  if (!clinicConfig.aiName.trim() || isPlaceholder(clinicConfig.aiName)) {
    add("FAIL", "clinicConfig.aiName must be set to the approved AI service name.");
  } else {
    add("PASS", "AI service name is configured.");
  }

  const activeBranches = clinicConfig.branches.filter((branch) => branch.isActive);
  if (activeBranches.length === 0) {
    add("FAIL", "At least one active branch is required.");
  }

  const branchNames = new Set<string>();
  for (const branch of activeBranches) {
    if (!branch.name.trim() || branchNames.has(branch.name)) {
      add("FAIL", "Active branch names must be present and unique.");
    }
    branchNames.add(branch.name);

    if (!branch.address.trim() || !branch.hasCompleteAddress) {
      add("FAIL", `Active branch ${branch.name || "(unnamed)"} needs a complete address.`);
    }
    if (branch.aliases.length === 0) {
      add("FAIL", `Active branch ${branch.name || "(unnamed)"} needs at least one recognition alias.`);
    }
    if (!branch.businessHours.trim()) {
      add("WARN", `Active branch ${branch.name || "(unnamed)"} has no business-hours guidance.`);
    }
  }

  const treatmentKeys = new Set<string>();
  for (const treatment of clinicConfig.treatmentList) {
    if (!treatment.key.trim() || treatmentKeys.has(treatment.key)) {
      add("FAIL", "Treatment keys must be present and unique.");
    }
    treatmentKeys.add(treatment.key);

    if (!treatment.name.trim() || treatment.aliases.length === 0 || !treatment.intro.trim() || !treatment.evaluationNote.trim()) {
      add("FAIL", `Treatment ${treatment.key || "(unnamed)"} is missing approved first-layer content.`);
    }
  }

  for (const concern of clinicConfig.concernList) {
    const missingKeys = concern.recommendedTreatmentKeys.filter((key) => !treatmentKeys.has(key));
    if (missingKeys.length > 0) {
      add("FAIL", `Concern ${concern.key} references an unknown treatment key.`);
    }
  }
}

async function validateSeedData() {
  const data = await loadSeedData();
  const requiredSeedGroups: Array<[string, number]> = [
    ["approved FAQ", data.faqEntries.length],
    ["handoff rules", data.handoffRules.length],
    ["pregnancy rules", data.pregnancyRules.length],
  ];

  for (const [name, count] of requiredSeedGroups) {
    if (count === 0) {
      add("FAIL", `${name} must contain at least one approved row.`);
    } else {
      add("PASS", `${name} data is available.`);
    }
  }

  if (data.pricingCampaigns.length === 0) {
    add("WARN", "No active pricing campaign seed is present; price questions will use the safe fallback reply.");
  } else {
    add("PASS", "Pricing campaign data is available.");
  }
}

function validateProductionEnvPresence() {
  const required = [
    "LINE_CHANNEL_ACCESS_TOKEN",
    "LINE_CHANNEL_SECRET",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "APP_BASE_URL",
    "BOOTSTRAP_OWNER_EMAIL",
    "CRON_SECRET",
  ];
  const provider = (process.env.AI_PROVIDER ?? "openai").toLowerCase();
  required.push(provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY");

  for (const name of required) {
    add(hasValue(name) ? "PASS" : "FAIL", `${name} is ${hasValue(name) ? "present" : "missing"}.`);
  }

  if (process.env.LIVE_DEMO_SEND_REPLY !== "true") {
    add("FAIL", "LIVE_DEMO_SEND_REPLY must be true for a production client deployment.");
  } else {
    add("PASS", "Production LINE replies are enabled.");
  }

  if (process.env.LIVE_DEMO_SKIP_SIGNATURE_VERIFY === "true") {
    add("FAIL", "LIVE_DEMO_SKIP_SIGNATURE_VERIFY must not be true for production.");
  } else {
    add("PASS", "LINE signature verification is not bypassed.");
  }
}

async function main() {
  validateClinicConfig();
  await validateSeedData();

  if (checkProductionEnv) {
    validateProductionEnvPresence();
  } else {
    add("WARN", "Production environment presence was not checked. Run with --check-production-env only in a secure deployment environment.");
  }

  for (const result of results) {
    console.log(`${result.level} ${result.message}`);
  }

  if (results.some((result) => result.level === "FAIL")) {
    process.exitCode = 1;
    return;
  }

  console.log("init:client-data: configuration checks passed");
}

main().catch(() => {
  console.error("FAIL Unable to validate client configuration.");
  process.exitCode = 1;
});
