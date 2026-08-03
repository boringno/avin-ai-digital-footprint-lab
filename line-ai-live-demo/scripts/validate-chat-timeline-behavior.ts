import { createChatTimelineScrollController } from "../src/hooks/use-chat-timeline-scroll";

function expect(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function createController() {
  let nextFrameId = 0;
  return createChatTimelineScrollController({
    cancelFrame: () => undefined,
    scheduleFrame: (callback) => {
      callback();
      nextFrameId += 1;
      return nextFrameId;
    },
  });
}

const timeline = { clientHeight: 500, scrollHeight: 1000, scrollTop: 0 };
const controller = createController();

controller.syncTimeline(timeline, "conversation-a");
expect(timeline.scrollTop === 1000, "T1: first mount must scroll to the latest message");

timeline.scrollHeight = 1200;
controller.syncTimeline(timeline, "conversation-a");
expect(timeline.scrollTop === 1200, "T2: new message while at the bottom must remain at the latest message");

timeline.scrollTop = 100;
controller.handleTimelineScroll(timeline);
timeline.scrollHeight = 1300;
controller.syncTimeline(timeline, "conversation-a");
expect(timeline.scrollTop === 100, "T3: staff reading older messages must not be pulled to the bottom");

controller.syncTimeline(timeline, "conversation-b");
expect(timeline.scrollTop === 1300, "T4: switching conversations must scroll to the latest message");

controller.syncTimeline(null, "conversation-c");
controller.syncTimeline(timeline, undefined);
expect(timeline.scrollTop === 1300, "T5: empty conversation input must not change the timeline");

const shortTimeline = { clientHeight: 500, scrollHeight: 120, scrollTop: 0 };
createController().syncTimeline(shortTimeline, "conversation-short");
expect(shortTimeline.scrollTop === 120, "T6: one-message timeline must initialize safely");

console.log("Chat timeline behavior validation passed: T1-T6");
