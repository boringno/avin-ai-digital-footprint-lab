import {
  canManageRuntimeContentReleases,
  canReviewFaqMiss,
  canUseWorkbench,
  canViewContent,
  canViewHandoffNotifications,
  canViewLeads,
  canViewReports,
  canViewTeam,
  type AdminStaffUser,
} from "@/lib/admin-auth";
import { staffRoleLabels } from "@/lib/admin-display-maps";

import styles from "./admin-page-header.module.css";

type AdminPageHeaderProps = {
  activeHref: string;
  description?: string;
  eyebrow: string;
  staff: AdminStaffUser;
  title: string;
};

type NavigationItem = {
  href: string;
  label: string;
  visible: boolean;
};

type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

export function AdminPageHeader({ activeHref, description, eyebrow, staff, title }: AdminPageHeaderProps) {
  const groups: NavigationGroup[] = [
    {
      label: "客服作業",
      items: [
        { href: "/admin/workbench", label: "接手工作台", visible: canUseWorkbench(staff.role) },
        { href: "/admin/conversations", label: "全部對話", visible: canUseWorkbench(staff.role) },
        { href: "/admin/leads", label: "預約線索", visible: canViewLeads(staff.role) },
      ],
    },
    {
      label: "知識與內容",
      items: [
        { href: "/admin/faq-candidates", label: "問題補強", visible: canReviewFaqMiss(staff.role) },
        { href: "/admin/content", label: "內容管理", visible: canViewContent(staff.role) },
        { href: "/admin/content-submissions", label: "資料提交", visible: canViewContent(staff.role) },
        { href: "/admin/runtime-releases", label: "正式回覆發布", visible: canManageRuntimeContentReleases(staff.role) },
      ],
    },
    {
      label: "營運管理",
      items: [
        { href: "/admin/schedules", label: "門診班表", visible: canViewContent(staff.role) },
        { href: "/admin/notifications", label: "通知設定", visible: canViewHandoffNotifications(staff.role) },
        { href: "/admin/reports", label: "月報", visible: canViewReports(staff.role) },
        { href: "/admin/team", label: "團隊管理", visible: canViewTeam(staff.role) },
      ],
    },
  ];

  return (
    <header className={styles.header}>
      <div className={styles.headingRow}>
        <div className={styles.headingCopy}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1 className={styles.title}>{title}</h1>
          {description ? <p className={styles.description}>{description}</p> : null}
        </div>
        <div className={styles.account} aria-label="目前登入帳號">
          <span className={styles.accountName}>{staff.displayName}</span>
          <span className={styles.role}>{staffRoleLabels[staff.role]}</span>
        </div>
      </div>

      <nav aria-label="客服後台主導覽" className={styles.navigation}>
        {groups.map((group) => {
          const visibleItems = group.items.filter((item) => item.visible);
          if (visibleItems.length === 0) return null;

          return (
            <div className={styles.group} key={group.label}>
              <span className={styles.groupLabel}>{group.label}</span>
              <div className={styles.links}>
                {visibleItems.map((item) => {
                  const isActive = item.href === activeHref;
                  return (
                    <a
                      aria-current={isActive ? "page" : undefined}
                      className={isActive ? `${styles.link} ${styles.activeLink}` : styles.link}
                      href={item.href}
                      key={item.href}
                    >
                      {item.label}
                    </a>
                  );
                })}
              </div>
            </div>
          );
        })}
        <form action="/api/admin/auth/logout" className={styles.logoutForm} method="post">
          <button className={styles.logoutButton} type="submit">登出</button>
        </form>
      </nav>
    </header>
  );
}
