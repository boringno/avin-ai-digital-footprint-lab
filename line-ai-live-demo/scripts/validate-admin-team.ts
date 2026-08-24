import fs from "node:fs";
import path from "node:path";

import {
  canManageTeam,
  canRemoveTeamMember,
  getTeamAccessEmailMode,
  isClientManagedRole,
  isSelfTeamInvitation,
} from "../src/lib/admin-team-data";
import {
  canAccessSystemAdmin,
  canCreateContentDraft,
  canEditContent,
  canEditLeads,
  canManagePlatformHandoffNotifications,
  canManageRuntimeContentReleases,
  canPublishContent,
  canReviewContent,
  canReviewFaqMiss,
  canReviewNluDisagreements,
  canSubmitContentSource,
  canUseWorkbench,
  canViewContent,
  canViewEngineeringKnowledge,
  canViewExecutiveSummary,
  canViewLeads,
  canViewOperationalDebug,
  canViewReports,
  canViewTeam,
  isPlatformDeveloperRole,
  isStaffAuthenticationAllowed,
  parsePlatformDeveloperAuthUserIds,
  type AdminStaffUser,
} from "../src/lib/admin-auth";

let passed = 0;

function expect(condition: unknown, label: string) {
  if (!condition) throw new Error(`Failed: ${label}`);
  passed += 1;
}

expect(
  isSelfTeamInvitation({
    actorAuthUserId: "owner-auth-id",
    actorEmail: "owner@example.com",
    targetAuthUserId: "owner-auth-id",
    targetEmail: "owner@example.com",
  }),
  "blocks an owner from inviting the same authenticated account",
);

expect(
  isSelfTeamInvitation({
    actorAuthUserId: "owner-auth-id",
    actorEmail: "Owner@Example.com",
    targetEmail: " owner@example.com ",
  }),
  "blocks an owner from inviting the same email with different casing",
);

expect(
  !isSelfTeamInvitation({
    actorAuthUserId: "owner-auth-id",
    actorEmail: "owner@example.com",
    targetAuthUserId: "manager-auth-id",
    targetEmail: "manager@example.com",
  }),
  "allows inviting a different team member",
);

expect(getTeamAccessEmailMode(null) === "invitation", "unconfirmed account receives an invitation email");
expect(getTeamAccessEmailMode("2026-07-16T12:00:00.000Z") === "password_reset", "confirmed account receives a password reset email");

expect(
  canRemoveTeamMember({ actorStaffId: "owner-id", targetRole: "agent", targetStaffId: "agent-id" }),
  "owner can remove an ordinary team member",
);
expect(
  !canRemoveTeamMember({ actorStaffId: "owner-id", targetRole: "owner", targetStaffId: "other-owner-id" }),
  "owner cannot remove another owner",
);
expect(
  !canRemoveTeamMember({ actorStaffId: "owner-id", targetRole: "agent", targetStaffId: "owner-id" }),
  "owner cannot remove themselves",
);

expect(canViewTeam("owner"), "owner can view team management");
expect(canViewTeam("manager"), "manager can view team management");
expect(canViewTeam("maintainer"), "maintainer can view team management");
expect(!canViewTeam("agent"), "agent cannot view team management");
expect(!canViewTeam("analyst"), "analyst cannot view team management");

expect(canViewEngineeringKnowledge("owner"), "owner can view engineering knowledge");
expect(canViewEngineeringKnowledge("maintainer"), "maintainer can view engineering knowledge");
expect(!canViewEngineeringKnowledge("manager"), "manager cannot view engineering knowledge");
expect(!canViewEngineeringKnowledge("agent"), "agent cannot view engineering knowledge");
expect(!canViewEngineeringKnowledge("analyst"), "analyst cannot view engineering knowledge");

expect(isClientManagedRole("manager"), "manager remains assignable from the clinic team API");
expect(!isClientManagedRole("maintainer"), "platform developer cannot be assigned through the clinic team API");
expect(!isClientManagedRole("owner"), "clinic owner cannot be assigned through the clinic team API");

const developerAuthId = "11111111-1111-4111-8111-111111111111";
const otherAuthId = "22222222-2222-4222-8222-222222222222";
expect(isPlatformDeveloperRole("maintainer"), "maintainer is the protected platform developer role");
expect(!isPlatformDeveloperRole("owner"), "clinic owner is not silently promoted to platform developer");
expect(
  parsePlatformDeveloperAuthUserIds(` ${developerAuthId.toUpperCase()},invalid,${developerAuthId} `).size === 1,
  "developer allowlist accepts exact UUIDs, normalizes case, and rejects invalid entries",
);
expect(
  !isStaffAuthenticationAllowed({ authUserId: developerAuthId, role: "maintainer" }),
  "developer role fails closed when the server allowlist is missing",
);
expect(
  isStaffAuthenticationAllowed({
    authUserId: developerAuthId,
    platformDeveloperAuthUserIds: `${otherAuthId},${developerAuthId}`,
    role: "maintainer",
  }),
  "developer role requires an exact server-side Auth User ID match",
);
expect(
  !isStaffAuthenticationAllowed({
    authUserId: `${developerAuthId}0`,
    platformDeveloperAuthUserIds: developerAuthId,
    role: "maintainer",
  }),
  "developer allowlist rejects near matches",
);
expect(
  isStaffAuthenticationAllowed({ authUserId: "ordinary-owner", role: "owner" }),
  "ordinary clinic roles are not coupled to the developer allowlist",
);

const developer = {
  authUserId: developerAuthId,
  displayName: "Platform Developer",
  email: "developer@example.test",
  id: "developer-staff-id",
  isActive: true,
  role: "maintainer",
  tenantId: "tenant-id",
} satisfies AdminStaffUser;

for (const [label, allowed] of [
  ["system controls", canAccessSystemAdmin("maintainer")],
  ["workbench", canUseWorkbench("maintainer")],
  ["lead view", canViewLeads("maintainer")],
  ["lead editing", canEditLeads("maintainer")],
  ["reports", canViewReports("maintainer")],
  ["executive summary", canViewExecutiveSummary("maintainer")],
  ["operational debug", canViewOperationalDebug("maintainer")],
  ["NLU review", canReviewNluDisagreements("maintainer")],
  ["engineering knowledge", canViewEngineeringKnowledge("maintainer")],
  ["FAQ review", canReviewFaqMiss("maintainer")],
  ["content view", canViewContent("maintainer")],
  ["content editing", canEditContent("maintainer")],
  ["content draft", canCreateContentDraft("maintainer")],
  ["content review", canReviewContent("maintainer")],
  ["content publishing", canPublishContent("maintainer")],
  ["source submission", canSubmitContentSource("maintainer")],
  ["runtime release", canManageRuntimeContentReleases("maintainer")],
  ["platform notifications", canManagePlatformHandoffNotifications("maintainer")],
  ["team management", canManageTeam(developer)],
] as const) {
  expect(allowed, `platform developer can access ${label}`);
}

const teamClientSource = fs.readFileSync(path.join(process.cwd(), "app", "admin", "team", "TeamClient.tsx"), "utf8");
expect(!/option\s+value=["']maintainer["']/u.test(teamClientSource), "developer role never appears in the client invitation selector");
expect(!/option\s+value=["']owner["']/u.test(teamClientSource), "clinic owner role never appears in the client invitation selector");

console.log(`admin team validation passed (${passed} checks)`);
