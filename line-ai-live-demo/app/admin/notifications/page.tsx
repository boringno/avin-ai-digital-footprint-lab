import { redirect } from "next/navigation";

import {
  canManageClinicHandoffNotifications,
  canManagePlatformHandoffNotifications,
  getAdminStaffFromCookies,
} from "@/lib/admin-auth";
import { listNotificationBranches, loadNotificationSettingsPageData } from "@/lib/admin-handoff-notification-settings";

import { NotificationRecipientsClient } from "./NotificationRecipientsClient";

export default async function AdminNotificationsPage() {
  const staff = await getAdminStaffFromCookies();
  if (!staff) {
    redirect("/admin/login");
  }

  const scope = canManageClinicHandoffNotifications(staff.role)
    ? "clinic"
    : canManagePlatformHandoffNotifications(staff.role)
      ? "platform"
      : null;
  if (!scope) {
    redirect("/admin/forbidden");
  }

  const settings = await loadNotificationSettingsPageData(staff);

  return (
    <NotificationRecipientsClient
      branches={listNotificationBranches()}
      initialPendingGroups={settings.pendingGroups}
      initialRecipients={settings.recipients}
      scope={scope}
    />
  );
}
