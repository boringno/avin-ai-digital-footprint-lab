const LINE_RECIPIENT_ID_PATTERN = /^[CRU][0-9a-f]{32}$/;
const LINE_GROUP_ID_PATTERN = /^C[0-9a-f]{32}$/;
const LINE_USER_ID_PATTERN = /^U[0-9a-f]{32}$/;

export function isLineGroupId(value: string) {
  return LINE_GROUP_ID_PATTERN.test(value.trim());
}

export function isLineRecipientId(value: string) {
  return LINE_RECIPIENT_ID_PATTERN.test(value.trim());
}

export function isLineUserId(value: string) {
  return LINE_USER_ID_PATTERN.test(value.trim());
}
