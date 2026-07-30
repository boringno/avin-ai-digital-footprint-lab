import { buildAdminLoginRateLimitKeys, buildAdminLoginResetPatch } from "../src/lib/admin-login-protection";

let passed = 0;

function expect(condition: unknown, label: string) {
  if (!condition) throw new Error(`Failed: ${label}`);
  passed += 1;
}

const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.SUPABASE_SERVICE_ROLE_KEY = "validation-only-secret";

try {
  const firstRequest = new Request("https://example.test/admin/login", { headers: { "x-forwarded-for": "203.0.113.10" } });
  const first = buildAdminLoginRateLimitKeys("Staff@example.com", firstRequest);
  const same = buildAdminLoginRateLimitKeys("staff@example.com", firstRequest);
  const differentEmail = buildAdminLoginRateLimitKeys("other@example.com", firstRequest);
  const differentSource = buildAdminLoginRateLimitKeys("staff@example.com", new Request("https://example.test/admin/login", { headers: { "x-real-ip": "203.0.113.11" } }));
  const resetPatch = buildAdminLoginResetPatch(new Date("2026-07-24T09:30:00.000Z"));

  expect(first.length === 2, "email and source each produce one key");
  expect(first.every((value) => /^[a-f0-9]{64}$/.test(value)), "keys are SHA-256 HMAC digests");
  expect(first.join(" ").includes("staff@example.com") === false, "email is never stored in a rate-limit key");
  expect(first.join(" ").includes("203.0.113.10") === false, "source address is never stored in a rate-limit key");
  expect(first.join("|") === same.join("|"), "email normalization is deterministic");
  expect(first[0] !== differentEmail[0], "different email changes the email key");
  expect(first[1] !== differentSource[1], "different source changes the source key");
  expect(resetPatch.failure_count === 0, "successful login clears failure count");
  expect(resetPatch.blocked_until === null, "successful login clears active block");
  expect(resetPatch.window_started_at === "2026-07-24T09:30:00.000Z", "reset patch timestamps the new clean window");
} finally {
  if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
}

console.log(`admin login protection validation passed (${passed} checks)`);
