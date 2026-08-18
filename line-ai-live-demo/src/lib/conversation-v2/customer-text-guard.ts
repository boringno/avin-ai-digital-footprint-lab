/**
 * Last line of defence between internal knowledge and the customer.
 *
 * `clinic-facts` deliberately labels approved knowledge ("療程名稱：X",
 * "X可評估方向：Y") so the model can ground a reply in auditable statements. Those
 * labels are internal: a customer must never receive them. Individual call sites are
 * responsible for choosing approved customer-facing copy, but relying only on call
 * sites means the next new path can silently regress. This guard is path-independent,
 * so any future route that forgets the distinction still fails closed.
 */

const INTERNAL_FIELD_LABEL_PATTERNS = [
  /^\s*療程名稱\s*[:：]/mu,
  /^\s*.{1,24}可評估方向\s*[:：]/mu,
  /^\s*.{1,24}搭配評估理由\s*[:：]/mu,
  /^\s*(?:核准事實|事實來源|資料版本|snapshot|factId)\s*[:：]/imu,
] as const;

export function containsInternalFieldLabel(text: string) {
  if (!text.trim()) return false;
  return INTERNAL_FIELD_LABEL_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Returns customer-safe text. When the candidate leaks an internal field label we
 * drop it entirely rather than trying to repair it: a partially stripped fact can
 * still read as a broken data dump, while the approved fallback always reads like
 * clinic copy.
 */
export function ensureCustomerSafeText(candidate: string, approvedFallback: string) {
  if (!containsInternalFieldLabel(candidate)) return candidate;
  return approvedFallback;
}
