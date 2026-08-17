import {
  resolveBookingLeadContactFields,
  resolveBookingLeadFields,
} from "../src/lib/admin-webhook-sync";
import { resolveBookingLeadSheetFields } from "../src/lib/google-sheets-log";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const existing = {
  interested_treatments: ["ONDA PRO"],
  preferred_branch: "高雄館",
  preferred_time_slots: ["8月18號下午"],
};

const replacement = resolveBookingLeadFields(existing, {
  bookingDraft: {
    requestedTimeSlots: [],
    timeSlots: [],
    treatment: "肉毒",
  },
  bookingTreatmentAction: "replace",
});

assert(JSON.stringify(replacement.interestedTreatments) === JSON.stringify(["肉毒"]), "BL1: a new booking must replace old treatment ownership");
assert(replacement.preferredBranch === null, "BL1: a new booking must not inherit the previous branch");
assert(replacement.preferredTimeSlots.length === 0, "BL1: a new booking must not inherit previous time slots");
const replacementContact = resolveBookingLeadContactFields({
  customer_name: "舊姓名",
  phone: "0911111111",
}, {
  bookingDraft: {
    requestedTimeSlots: [],
    timeSlots: [],
    treatment: "肉毒",
  },
  bookingTreatmentAction: "replace",
});
assert(replacementContact.customerName === null, "BL1: a new booking must not inherit the previous customer name");
assert(replacementContact.phone === null, "BL1: a new booking must not inherit the previous phone");

const addition = resolveBookingLeadFields(existing, {
  bookingDraft: {
    branch: "高雄館",
    requestedTimeSlots: [],
    timeSlots: ["8月18號下午"],
    treatment: "ONDA PRO、肉毒",
  },
  bookingTreatmentAction: "add",
});

assert(
  JSON.stringify(addition.interestedTreatments) === JSON.stringify(["ONDA PRO", "肉毒"]),
  "BL2: explicit add must retain both treatments",
);
assert(addition.preferredBranch === "高雄館", "BL2: add must retain the current branch");
assert(addition.preferredTimeSlots.includes("8月18號下午"), "BL2: add must retain current time slots");

const sheetReplacement = resolveBookingLeadSheetFields({
  action: "replace",
  currentBranch: "高雄館",
  currentTimeSlots: "8月18號下午",
  currentTreatment: "ONDA PRO",
  nextBranch: "",
  nextTimeSlots: "",
  nextTreatment: "肉毒",
});
assert(sheetReplacement.treatment === "肉毒", "BL3: Sheets replacement must use only the new treatment");
assert(!sheetReplacement.branch && !sheetReplacement.timeSlots, "BL3: Sheets replacement must clear old scheduling fields");

const sheetAddition = resolveBookingLeadSheetFields({
  action: "add",
  currentBranch: "高雄館",
  currentTimeSlots: "8月18號下午",
  currentTreatment: "ONDA PRO",
  nextBranch: "高雄館",
  nextTimeSlots: "8月18號下午",
  nextTreatment: "ONDA PRO＋肉毒",
});
assert(sheetAddition.treatment === "ONDA PRO＋肉毒", "BL4: Sheets addition must retain both treatments");
assert(sheetAddition.branch === "高雄館" && sheetAddition.timeSlots === "8月18號下午", "BL4: Sheets addition must retain schedule fields");

console.log("booking lead ownership validation passed (12 checks)");
