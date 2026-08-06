"use client";

import { useEffect, useMemo, useState } from "react";

import { bookingStatusLabels, type BookingStatusKey } from "@/lib/admin-display-maps";
import type { AdminLeadCard, AdminLeadsData } from "@/lib/admin-leads-data";

type Column = {
  keys: BookingStatusKey[];
  label: string;
};

const columns: Column[] = [
  { keys: ["new"], label: "新進線" },
  { keys: ["contacted"], label: "已聯繫" },
  { keys: ["booked"], label: "已預約" },
  { keys: ["arrived"], label: "已到店" },
  { keys: ["won", "lost"], label: "成交 / 流失" },
];

const statusKeys = Object.keys(bookingStatusLabels) as BookingStatusKey[];

export function LeadsClient({
  canEdit,
  initialData,
  staffId,
}: {
  canEdit: boolean;
  initialData: AdminLeadsData;
  staffId: string;
}) {
  const [data, setData] = useState(initialData);
  const [branchFilter, setBranchFilter] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isCompact, setIsCompact] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState("");
  const [savingLeadId, setSavingLeadId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 900px)");
    const apply = () => setIsCompact(mediaQuery.matches);
    apply();
    mediaQuery.addEventListener("change", apply);
    return () => mediaQuery.removeEventListener("change", apply);
  }, []);

  const branchOptions = useMemo(
    () =>
      Array.from(new Set(data.leads.map((lead) => lead.preferredBranch).filter((branch): branch is string => Boolean(branch)))).sort(),
    [data.leads],
  );

  const filteredLeads = data.leads.filter((lead) => {
    if (branchFilter && lead.preferredBranch !== branchFilter) {
      return false;
    }
    if (statusFilter && lead.bookingStatus !== statusFilter) {
      return false;
    }
    if (ownerFilter === "me" && lead.staffOwnerId !== staffId) {
      return false;
    }
    if (ownerFilter === "unassigned" && lead.staffOwnerId) {
      return false;
    }
    if (ownerFilter && ownerFilter !== "me" && ownerFilter !== "unassigned" && lead.staffOwnerId !== ownerFilter) {
      return false;
    }
    return true;
  });

  async function refresh() {
    const response = await fetch("/api/admin/leads", { cache: "no-store" });
    if (!response.ok) {
      setErrorMessage("預約線索載入失敗，請按重新整理再試。");
      return;
    }

    const nextData = (await response.json()) as AdminLeadsData;
    setData(nextData);
  }

  async function updateLead(
    leadId: string,
    payload: {
      appointment_at?: string | null;
      assign_to_self?: boolean;
      booking_status?: BookingStatusKey;
      notes?: string;
    },
  ) {
    if (!canEdit) {
      setErrorMessage("此帳號目前只能查看，無法修改線索。");
      return;
    }
    setSavingLeadId(leadId);
    setErrorMessage("");
    try {
      const response = await fetch("/api/admin/leads/update", {
        body: JSON.stringify({
          lead_id: leadId,
          ...payload,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = (await response.json()) as { error?: string; ok?: boolean };
      if (!response.ok || !result.ok) {
        setErrorMessage("更新預約線索失敗，請再按一次。");
        return;
      }
      await refresh();
    } catch {
      setErrorMessage("更新預約線索失敗，請再按一次。");
    } finally {
      setSavingLeadId("");
    }
  }

  const compactSections = columns.map((column) => ({
    count: filteredLeads.filter((lead) => column.keys.includes(lead.bookingStatus)).length,
    ...column,
  }));

  return (
    <section style={{ display: "grid", gap: 14 }}>
      {errorMessage ? (
        <div style={errorStyle}>{errorMessage}</div>
      ) : null}

      {isCompact ? (
        <div style={mobileIntroStyle}>
          <div>
            <p style={introEyebrowStyle}>手機快速總覽</p>
            <strong style={{ display: "block", fontSize: 20, lineHeight: 1.2 }}>先把今天要追的名單篩出來</strong>
            <p style={introBodyStyle}>目前篩選後共有 {filteredLeads.length} 筆線索，先看未指派、已聯繫、已預約三段最省時間。</p>
          </div>
          <span style={introBadgeStyle}>全部 {data.leads.length} 筆</span>
        </div>
      ) : null}

      <div style={{ ...filterPanelStyle, ...(isCompact ? compactFilterPanelStyle : null) }}>
        <select onChange={(event) => setBranchFilter(event.target.value)} style={inputStyle} value={branchFilter}>
          <option value="">全部館別</option>
          {branchOptions.map((branch) => (
            <option key={branch} value={branch}>
              {branch}
            </option>
          ))}
        </select>
        <select onChange={(event) => setStatusFilter(event.target.value)} style={inputStyle} value={statusFilter}>
          <option value="">全部狀態</option>
          {statusKeys.map((status) => (
            <option key={status} value={status}>
              {bookingStatusLabels[status]}
            </option>
          ))}
        </select>
        <select onChange={(event) => setOwnerFilter(event.target.value)} style={inputStyle} value={ownerFilter}>
          <option value="">全部負責人</option>
          <option value="me">只看我的</option>
          <option value="unassigned">未指派</option>
          {data.staffOptions.map((staff) => (
            <option key={staff.id} value={staff.id}>
              {staff.displayName}
            </option>
          ))}
        </select>
        <button onClick={() => void refresh()} style={ghostButtonStyle} type="button">
          重新整理
        </button>
      </div>

      {isCompact ? (
        <>
          <div style={summaryStripStyle}>
            {compactSections.map((section) => (
              <div key={section.label} style={summaryPillStyle}>
                <span style={{ color: "#5f726b", fontSize: 12 }}>{section.label}</span>
                <strong style={{ fontSize: 18 }}>{section.count}</strong>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {filteredLeads.length === 0 ? <p style={emptyStyle}>目前沒有符合條件的線索</p> : null}
            {filteredLeads.map((lead) => (
              <LeadCard
                canEdit={canEdit}
                isCompact
                isSaving={savingLeadId === lead.id}
                key={lead.id}
                lead={lead}
                onAssignSelf={() => updateLead(lead.id, { assign_to_self: true })}
                onSaveAppointmentAt={(appointmentAt) => updateLead(lead.id, { appointment_at: appointmentAt })}
                onSaveNotes={(notes) => updateLead(lead.id, { notes })}
                onStatusChange={(bookingStatus) => updateLead(lead.id, { booking_status: bookingStatus })}
              />
            ))}
          </div>
        </>
      ) : (
        <div style={boardStyle}>
          {columns.map((column) => {
            const columnLeads = filteredLeads.filter((lead) => column.keys.includes(lead.bookingStatus));
            return (
              <section key={column.label} style={columnStyle}>
                <header style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
                  <h2 style={{ fontSize: 18, margin: 0 }}>{column.label}</h2>
                  <span style={countBadgeStyle}>{columnLeads.length}</span>
                </header>

                <div style={{ display: "grid", gap: 10 }}>
                  {columnLeads.length === 0 ? <p style={emptyStyle}>目前沒有線索</p> : null}
                  {columnLeads.map((lead) => (
                    <LeadCard
                      canEdit={canEdit}
                      isCompact={false}
                      isSaving={savingLeadId === lead.id}
                      key={lead.id}
                      lead={lead}
                      onAssignSelf={() => updateLead(lead.id, { assign_to_self: true })}
                      onSaveAppointmentAt={(appointmentAt) => updateLead(lead.id, { appointment_at: appointmentAt })}
                      onSaveNotes={(notes) => updateLead(lead.id, { notes })}
                      onStatusChange={(bookingStatus) => updateLead(lead.id, { booking_status: bookingStatus })}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}

function LeadCard({
  canEdit,
  isCompact,
  isSaving,
  lead,
  onAssignSelf,
  onSaveAppointmentAt,
  onSaveNotes,
  onStatusChange,
}: {
  canEdit: boolean;
  isCompact: boolean;
  isSaving: boolean;
  lead: AdminLeadCard;
  onAssignSelf: () => Promise<void>;
  onSaveAppointmentAt: (appointmentAt: string | null) => Promise<void>;
  onSaveNotes: (notes: string) => Promise<void>;
  onStatusChange: (status: BookingStatusKey) => Promise<void>;
}) {
  const [notesDraft, setNotesDraft] = useState(lead.notes);
  const [appointmentAtDraft, setAppointmentAtDraft] = useState(toDateTimeLocalValue(lead.appointmentAt));

  return (
    <article style={cardStyle}>
      <div style={{ alignItems: "flex-start", display: "flex", gap: 8, justifyContent: "space-between" }}>
        <div>
          <strong>{lead.displayName}</strong>
          {hasDistinctCustomerName(lead.customerName, lead.displayName) ? <p style={customerNameStyle}>客人姓名：{lead.customerName}</p> : null}
          <p style={mutedTextStyle}>{formatTime(lead.updatedAt)} 更新</p>
        </div>
        <span style={statusPillStyle}>{bookingStatusLabels[lead.bookingStatus]}</span>
      </div>

      <div style={{ display: "grid", gap: 5 }}>
        <SmallLine label="療程" value={lead.interestedTreatments.join("、") || "-"} />
        <SmallLine label="館別" value={lead.preferredBranch || "-"} />
        <SmallLine label="時段" value={lead.preferredTimeSlots.join("、") || "-"} />
        <SmallLine
          label="電話"
          value={
            lead.phone ? (
              <a href={`tel:${lead.phone}`} style={phoneLinkStyle}>
                {lead.phone}
              </a>
            ) : (
              "-"
            )
          }
        />
        <SmallLine label="負責" value={lead.staffOwnerName || "未指派"} />
      </div>

      <select
        disabled={!canEdit || isSaving}
        onChange={(event) => void onStatusChange(event.target.value as BookingStatusKey)}
        style={inputStyle}
        value={lead.bookingStatus}
      >
        {statusKeys.map((status) => (
          <option key={status} value={status}>
            {bookingStatusLabels[status]}
          </option>
        ))}
      </select>

      <label style={{ color: "#31423d", display: "grid", fontSize: 13, gap: 5 }}>
        已確認預約時間
        <input
          disabled={!canEdit || isSaving}
          onChange={(event) => setAppointmentAtDraft(event.target.value)}
          style={inputStyle}
          type="datetime-local"
          value={appointmentAtDraft}
        />
        <span style={{ color: "#60736c", fontSize: 12, lineHeight: 1.45 }}>
          時間過後，客人下次訊息會開啟新的預約流程；不會自動標示已到店。
        </span>
      </label>

      <textarea
        disabled={!canEdit || isSaving}
        onChange={(event) => setNotesDraft(event.target.value)}
        placeholder="客服備註"
        rows={isCompact ? 4 : 3}
        style={{ ...inputStyle, minHeight: isCompact ? 104 : 88, resize: "vertical" }}
        value={notesDraft}
      />

      <div style={{ display: "flex", flexDirection: isCompact ? "column" : "row", flexWrap: "wrap", gap: 8 }}>
        <button
          disabled={!canEdit || isSaving || appointmentAtDraft === toDateTimeLocalValue(lead.appointmentAt)}
          onClick={() => void onSaveAppointmentAt(appointmentAtDraft ? new Date(appointmentAtDraft).toISOString() : null)}
          style={ghostButtonStyle}
          type="button"
        >
          儲存預約時間
        </button>
        <button disabled={!canEdit || isSaving || notesDraft === lead.notes} onClick={() => void onSaveNotes(notesDraft)} style={primaryButtonStyle} type="button">
          {isSaving ? "處理中..." : "儲存備註"}
        </button>
        <button disabled={!canEdit || isSaving || Boolean(lead.staffOwnerId)} onClick={() => void onAssignSelf()} style={ghostButtonStyle} type="button">
          指派給我
        </button>
      </div>
    </article>
  );
}

function SmallLine({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <p style={{ color: "#31423d", fontSize: 13, lineHeight: 1.45, margin: 0 }}>
      <span style={{ color: "#60736c" }}>{label}：</span>
      {value}
    </p>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(new Date(value));
}

function toDateTimeLocalValue(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function hasDistinctCustomerName(customerName: string | null, displayName: string) {
  return Boolean(customerName && customerName.trim() && customerName.trim() !== displayName.trim());
}

const boardStyle = {
  alignItems: "start",
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
} satisfies React.CSSProperties;

const mobileIntroStyle = {
  alignItems: "flex-start",
  background: "linear-gradient(135deg, #16302b 0%, #1e5d49 100%)",
  borderRadius: 18,
  color: "#fff",
  display: "flex",
  gap: 12,
  justifyContent: "space-between",
  padding: 14,
} satisfies React.CSSProperties;

const introEyebrowStyle = {
  color: "rgba(255,255,255,0.78)",
  fontSize: 12,
  fontWeight: 700,
  margin: 0,
} satisfies React.CSSProperties;

const introBodyStyle = {
  color: "rgba(255,255,255,0.9)",
  fontSize: 13,
  lineHeight: 1.6,
  margin: "6px 0 0",
} satisfies React.CSSProperties;

const introBadgeStyle = {
  background: "rgba(255,255,255,0.12)",
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: 999,
  color: "#fff",
  fontSize: 12,
  fontWeight: 700,
  padding: "6px 10px",
  whiteSpace: "nowrap",
} satisfies React.CSSProperties;

const summaryStripStyle = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 110px), 1fr))",
} satisfies React.CSSProperties;

const summaryPillStyle = {
  background: "#fff",
  border: "1px solid #d5e4de",
  borderRadius: 16,
  display: "grid",
  gap: 2,
  minHeight: 72,
  padding: 12,
} satisfies React.CSSProperties;

const cardStyle = {
  background: "#fff",
  border: "1px solid #d9e7e0",
  borderRadius: 16,
  display: "grid",
  gap: 10,
  padding: 12,
} satisfies React.CSSProperties;

const columnStyle = {
  background: "#eef6f2",
  border: "1px solid #d5e4de",
  borderRadius: 18,
  display: "grid",
  gap: 12,
  padding: 12,
} satisfies React.CSSProperties;

const countBadgeStyle = {
  background: "#fff",
  border: "1px solid #c9dad3",
  borderRadius: 999,
  color: "#315047",
  fontSize: 12,
  padding: "4px 8px",
} satisfies React.CSSProperties;

const emptyStyle = {
  color: "#66756f",
  fontSize: 13,
  lineHeight: 1.5,
  margin: 0,
} satisfies React.CSSProperties;

const errorStyle = {
  background: "#fff1f0",
  border: "1px solid #ffccc7",
  borderRadius: 14,
  color: "#8c1d18",
  padding: 12,
} satisfies React.CSSProperties;

const filterPanelStyle = {
  background: "#fff",
  border: "1px solid #d5e4de",
  borderRadius: 18,
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 170px), 1fr))",
  padding: 12,
} satisfies React.CSSProperties;

const compactFilterPanelStyle = {
  position: "sticky",
  top: 0,
  zIndex: 8,
} satisfies React.CSSProperties;

const ghostButtonStyle = {
  background: "#fff",
  border: "1px solid #b9cbc5",
  borderRadius: 12,
  color: "#16302b",
  cursor: "pointer",
  font: "inherit",
  fontWeight: 700,
  minHeight: 44,
  padding: "9px 12px",
} satisfies React.CSSProperties;

const inputStyle = {
  border: "1px solid #c9dad3",
  borderRadius: 12,
  font: "inherit",
  padding: 10,
  width: "100%",
} satisfies React.CSSProperties;

const mutedTextStyle = {
  color: "#66756f",
  fontSize: 12,
  margin: "3px 0 0",
} satisfies React.CSSProperties;

const customerNameStyle = {
  color: "#335563",
  fontSize: 13,
  fontWeight: 700,
  margin: "4px 0 0",
} satisfies React.CSSProperties;

const primaryButtonStyle = {
  background: "#16a34a",
  border: "1px solid #16a34a",
  borderRadius: 12,
  color: "#fff",
  cursor: "pointer",
  font: "inherit",
  fontWeight: 700,
  minHeight: 44,
  padding: "9px 12px",
} satisfies React.CSSProperties;

const statusPillStyle = {
  background: "#dcfce7",
  borderRadius: 999,
  color: "#166534",
  fontSize: 12,
  padding: "5px 8px",
} satisfies React.CSSProperties;

const phoneLinkStyle = {
  color: "#0f766e",
  fontWeight: 700,
} satisfies React.CSSProperties;
