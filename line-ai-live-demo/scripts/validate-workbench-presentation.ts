import {
  getWorkbenchQueueControlAction,
  getWorkbenchQueuePrimaryLabel,
  getWorkbenchQueueStatusLabel,
  getWorkbenchQueueStatusText,
} from "../src/lib/admin-workbench-presentation";

function expect(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

expect(getWorkbenchQueueControlAction("pending", "handoff_pending") === "mark_human_active", "W1: pending handoff must offer takeover");
expect(getWorkbenchQueueControlAction("active", "handoff_pending") === "mark_human_active", "W2: assigned pending handoff must still offer takeover");
expect(getWorkbenchQueueControlAction("active", "ai_active") === "mark_human_active", "W3: AI-active tracked conversation must offer human takeover");
expect(getWorkbenchQueueControlAction("active", "human_active") === "resume_ai", "W4: only a human-active conversation may offer AI resume");
expect(getWorkbenchQueuePrimaryLabel("active", "handoff_pending") === "接手回覆", "W5: handoff card label must match takeover action");
expect(getWorkbenchQueueStatusLabel("active", "handoff_pending") === "待接手", "W6: assigned handoff must remain visibly pending");
expect(getWorkbenchQueueStatusText("active", "handoff_pending", 12).includes("等待真人接手"), "W7: assigned handoff status text must remain explicit");

console.log("Workbench presentation validation passed: W1-W7");
