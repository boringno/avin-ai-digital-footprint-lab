import { canRemoveTeamMember, getTeamAccessEmailMode, isSelfTeamInvitation } from "../src/lib/admin-team-data";
import { canViewEngineeringKnowledge, canViewTeam } from "../src/lib/admin-auth";

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

console.log(`admin team validation passed (${passed} checks)`);
