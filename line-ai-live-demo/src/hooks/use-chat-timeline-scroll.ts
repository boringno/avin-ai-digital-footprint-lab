"use client";

import { useEffect, useRef } from "react";

type TimelineScrollMetrics = {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
};

const STICK_TO_BOTTOM_THRESHOLD_PX = 80;

export function isTimelineNearBottom(
  metrics: TimelineScrollMetrics,
  thresholdPx = STICK_TO_BOTTOM_THRESHOLD_PX,
) {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= thresholdPx;
}

export function useChatTimelineScroll(conversationId?: string, latestMessageId?: string) {
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const renderedConversationIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline || !conversationId) {
      return;
    }

    const conversationChanged = renderedConversationIdRef.current !== conversationId;
    renderedConversationIdRef.current = conversationId;
    if (!conversationChanged && !shouldStickToBottomRef.current) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      timeline.scrollTop = timeline.scrollHeight;
      shouldStickToBottomRef.current = true;
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [conversationId, latestMessageId]);

  function prepareForConversationChange() {
    shouldStickToBottomRef.current = true;
  }

  function handleTimelineScroll() {
    const timeline = timelineRef.current;
    if (!timeline) {
      return;
    }
    shouldStickToBottomRef.current = isTimelineNearBottom(timeline);
  }

  return {
    handleTimelineScroll,
    prepareForConversationChange,
    timelineRef,
  };
}
