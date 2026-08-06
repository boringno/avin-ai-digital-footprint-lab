import { NextResponse } from "next/server";

import { canEditLeads, requireAdminStaff } from "@/lib/admin-auth";
import { updateAdminLead } from "@/lib/admin-leads-data";

export const runtime = "nodejs";

type UpdateLeadBody = {
  appointment_at?: string | null;
  assign_to_self?: boolean;
  booking_status?: string;
  lead_id?: string;
  notes?: string;
};

export async function POST(request: Request) {
  const staff = await requireAdminStaff(request);
  if (!staff) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!canEditLeads(staff.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as UpdateLeadBody;
  if (!body.lead_id) {
    return NextResponse.json({ ok: false, error: "lead_id is required" }, { status: 400 });
  }

  try {
    const lead = await updateAdminLead({
      appointmentAt: body.appointment_at,
      assignToSelf: body.assign_to_self,
      bookingStatus: body.booking_status,
      leadId: body.lead_id,
      notes: body.notes,
      staff,
    });

    return NextResponse.json({
      lead,
      ok: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown lead update error",
      },
      { status: 400 },
    );
  }
}
