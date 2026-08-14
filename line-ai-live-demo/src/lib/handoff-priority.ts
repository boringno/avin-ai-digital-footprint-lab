export function getHandoffPriority(reason: null | string) {
  const normalized = reason?.trim().toLowerCase() ?? "";
  if (!normalized) return 0;
  if (normalized.includes("post_procedure_emergency")) return 100;
  if (normalized.includes("post_procedure_issue")) return 80;
  if (normalized.includes("pregnancy") || normalized.includes("serious_complaint")) return 60;
  return 10;
}

export function selectHigherPriorityHandoffReason(currentReason: null | string, incomingReason: string) {
  if (!currentReason || getHandoffPriority(incomingReason) > getHandoffPriority(currentReason)) {
    return incomingReason;
  }
  return currentReason;
}

export function isHandoffEscalation(previousReason: null | string, nextReason: null | string) {
  return getHandoffPriority(nextReason) > getHandoffPriority(previousReason);
}
