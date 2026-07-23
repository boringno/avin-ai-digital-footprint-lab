import type { AdminStaffUser } from "../src/lib/admin-auth";
import { getNotificationRecipientLimit, getNotificationRecipientScope } from "../src/lib/admin-handoff-notification-settings";

let passed = 0;

function expect(condition: unknown, label: string) {
  if (!condition) throw new Error(`Failed: ${label}`);
  passed += 1;
}

function staff(role: AdminStaffUser["role"]): AdminStaffUser {
  return { authUserId: "auth-test", displayName: "測試人員", email: "test@example.test", id: "staff-test", isActive: true, role, tenantId: "tenant_001" };
}

expect(getNotificationRecipientScope(staff("owner")) === "clinic", "owner manages clinic recipients only");
expect(getNotificationRecipientScope(staff("maintainer")) === "platform", "maintainer manages platform recipients only");
expect(getNotificationRecipientLimit("clinic") === 3, "clinic branch recipient limit is three");
expect(getNotificationRecipientLimit("platform") === 10, "platform branch recipient limit is ten");

let agentRejected = false;
try {
  getNotificationRecipientScope(staff("agent"));
} catch {
  agentRejected = true;
}
expect(agentRejected, "agent cannot manage notification recipients");

console.log(`handoff recipient settings validation passed (${passed} checks)`);
