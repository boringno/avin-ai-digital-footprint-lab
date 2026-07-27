import type { AdminStaffUser } from "../src/lib/admin-auth";
import { getNotificationRecipientLimit, getNotificationRecipientScope } from "../src/lib/admin-handoff-notification-settings";

let passed = 0;

function expect(condition: unknown, label: string) {
  if (!condition) {
    throw new Error(`Failed: ${label}`);
  }
  passed += 1;
}

function staff(role: AdminStaffUser["role"]): AdminStaffUser {
  return {
    authUserId: "auth-test",
    displayName: "測試管理員",
    email: "test@example.test",
    id: "staff-test",
    isActive: true,
    role,
    tenantId: "tenant_001",
  };
}

expect(getNotificationRecipientScope(staff("owner")) === "clinic", "owner manages clinic recipients only");
expect(getNotificationRecipientScope(staff("maintainer")) === "platform", "maintainer manages platform recipients only");
expect(getNotificationRecipientLimit("clinic", "email") === 3, "clinic email recipient limit is three");
expect(getNotificationRecipientLimit("platform", "email") === 10, "platform email recipient limit is ten");
expect(getNotificationRecipientLimit("clinic", "line_group") === 1, "clinic line group limit is one");
expect(getNotificationRecipientLimit("platform", "line_group") === 1, "platform line group limit is one");

let agentRejected = false;
try {
  getNotificationRecipientScope(staff("agent"));
} catch {
  agentRejected = true;
}
expect(agentRejected, "agent cannot manage notification recipients");

console.log(`handoff recipient settings validation passed (${passed} checks)`);
