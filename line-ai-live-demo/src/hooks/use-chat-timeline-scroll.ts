"use client";

import { useEffect, useRef } from "react";

type TimelineScrollMetrics = {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
};

type TimelineScrollElement = TimelineScrollMetrics;

type TimelineScrollControllerDependencies = {
  cancelFrame?: (frameId: number) => void;
  scheduleFrame?: (callback: () => void) => number;
};

const STICK_TO_BOTTOM_THRESHOLD_PX = 80;

export function isTimelineNearBottom(
  metrics: TimelineScrollMetrics,
  thresholdPx = STICK_TO_BOTTOM_THRESHOLD_PX,
) {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= thresholdPx;
}

export function createChatTimelineScrollController(
  dependencies: TimelineScrollControllerDependencies = {},
) {
  const cancelFrame = dependencies.cancelFrame ?? ((frameId: number) => window.cancelAnimationFrame(frameId));
  const scheduleFrame = dependencies.scheduleFrame ?? ((callback: () => void) => window.requestAnimationFrame(callback));
  let renderedConversationId: string | undefined;
  let shouldStickToBottom = true;

  function syncTimeline(timeline: TimelineScrollElement | null, conversationId?: string) {
    if (!timeline || !conversationId) {
      return;
    }

    const conversationChanged = renderedConversationId !== conversationId;
    renderedConversationId = conversationId;
    if (!conversationChanged && !shouldStickToBottom) {
      return;
    }

    const animationFrame = scheduleFrame(() => {
      timeline.scrollTop = timeline.scrollHeight;
      shouldStickToBottom = true;
    });

    return () => cancelFrame(animationFrame);
  }

  function prepareForConversationChange() {
    shouldStickToBottom = true;
  }

  function handleTimelineScroll(timeline: TimelineScrollElement | null) {
    if (!timeline) {
      return;
    }
    shouldStickToBottom = isTimelineNearBottom(timeline);
  }

  return {
    handleTimelineScroll,
    prepareForConversationChange,
    syncTimeline,
  };
}

export function useChatTimelineScroll(conversationId?: string, latestMessageId?: string) {
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<ReturnType<typeof createChatTimelineScrollController> | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createChatTimelineScrollController();
  }

  useEffect(() => {
    return controllerRef.current?.syncTimeline(timelineRef.current, conversationId);
  }, [conversationId, latestMessageId]);

  function prepareForConversationChange() {
    controllerRef.current?.prepareForConversationChange();
  }

  function handleTimelineScroll() {
    controllerRef.current?.handleTimelineScroll(timelineRef.current);
  }

  return {
    handleTimelineScroll,
    prepareForConversationChange,
    timelineRef,
  };
}
