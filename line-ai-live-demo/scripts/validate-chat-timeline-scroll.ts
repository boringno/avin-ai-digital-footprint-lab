import { isTimelineNearBottom } from "../src/hooks/use-chat-timeline-scroll";

function expect(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

expect(
  isTimelineNearBottom({ clientHeight: 500, scrollHeight: 1000, scrollTop: 500 }),
  "S1: timeline at the bottom must keep following new messages",
);
expect(
  isTimelineNearBottom({ clientHeight: 500, scrollHeight: 1000, scrollTop: 420 }),
  "S2: timeline within the 80px threshold must keep following new messages",
);
expect(
  !isTimelineNearBottom({ clientHeight: 500, scrollHeight: 1000, scrollTop: 419 }),
  "S3: staff reading older messages must not be pulled back to the bottom",
);
expect(
  isTimelineNearBottom({ clientHeight: 600, scrollHeight: 400, scrollTop: 0 }),
  "S4: a short timeline must be treated as already at the bottom",
);

console.log("Chat timeline scroll validation passed: S1-S4");
