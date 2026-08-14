import {
  CONVERSATION_V2_REPLAY_RECORD_SCHEMA_VERSION,
  ConversationV2ReplayRepository,
  type ConversationV2ShadowRecord,
} from "../src/lib/conversation-v2/repository";
import type { TurnUnderstanding } from "../src/lib/conversation-v2/types";

let passed = 0;

function expect(condition: unknown, label: string) {
  if (!condition) throw new Error(`Failed: ${label}`);
  passed += 1;
}

const TENANT = "tenant_001";
const USER = "line-user-1";
const EPISODE = "episode-current";

function turn(overrides: Partial<TurnUnderstanding> = {}): TurnUnderstanding {
  return {
    areas: [],
    concerns: [],
    confidence: 0.99,
    receivedAt: "2099-01-01T00:00:00.000Z",
    speechAct: "unknown",
    text: "",
    treatments: [],
    turnId: "untrusted-after-completion-id",
    ...overrides,
  };
}

function record(input: {
  episodeId?: string;
  lineTimestamp: number;
  messageId?: string;
  turn: TurnUnderstanding;
  webhookEventId?: string;
}): ConversationV2ShadowRecord {
  return {
    episodeId: input.episodeId ?? EPISODE,
    lineTimestamp: input.lineTimestamp,
    messageId: input.messageId,
    schemaVersion: CONVERSATION_V2_REPLAY_RECORD_SCHEMA_VERSION,
    tenantId: TENANT,
    turn: input.turn,
    userId: USER,
    webhookEventId: input.webhookEventId,
  };
}

let episodeSequence = 0;
const repository = new ConversationV2ReplayRepository({
  createEpisodeId: () => `fresh-episode-${++episodeSequence}`,
  now: () => "2026-08-14T10:00:00.000Z",
});

const startBooking = record({
  lineTimestamp: 1_000,
  messageId: "msg-001",
  turn: turn({
    booking: {
      explicit: true,
      fields: { treatmentKeys: ["onda_pro"] },
      intent: "create",
    },
    speechAct: "book_consultation",
    text: "我想預約 ONDA",
  }),
  webhookEventId: "evt-z",
});
const provideBranch = record({
  lineTimestamp: 2_000,
  messageId: "msg-002",
  turn: turn({
    booking: {
      explicit: false,
      fields: { branch: "高雄館" },
      intent: "none",
    },
    speechAct: "provide_booking_field",
    text: "高雄館",
  }),
  webhookEventId: "evt-a",
});

const chronological = repository.replay({
  episodeId: EPISODE,
  records: [startBooking, provideBranch],
  tenantId: TENANT,
  userId: USER,
});
const reversedAfterCompletion = repository.replay({
  episodeId: EPISODE,
  records: [provideBranch, startBooking],
  tenantId: TENANT,
  userId: USER,
});
expect(chronological.state.bookingTask.draft.branch === "高雄館",
  "chronological replay captures a booking field after booking starts");
expect(JSON.stringify(reversedAfterCompletion.state) === JSON.stringify(chronological.state),
  "out-of-order after() completion produces the same replayed state");
expect(reversedAfterCompletion.steps.map((step) => step.identity).join(",") === "message:msg-001,message:msg-002",
  "replay orders turns by LINE timestamp rather than array or completion order");
expect(reversedAfterCompletion.state.updatedAt === "1970-01-01T00:00:02.000Z",
  "replay replaces server completion time with the authoritative LINE timestamp");

const sameTimestampA = record({
  lineTimestamp: 3_000,
  messageId: "msg-a",
  turn: turn({ speechAct: "ask_clinic_info", text: "你們有幾家店" }),
});
const sameTimestampB = record({
  lineTimestamp: 3_000,
  messageId: "msg-b",
  turn: turn({ speechAct: "ask_price", text: "多少錢" }),
});
const tieForward = repository.replay({
  episodeId: EPISODE,
  records: [sameTimestampA, sameTimestampB],
  tenantId: TENANT,
  userId: USER,
});
const tieReverse = repository.replay({
  episodeId: EPISODE,
  records: [sameTimestampB, sameTimestampA],
  tenantId: TENANT,
  userId: USER,
});
expect(tieForward.steps.map((step) => step.identity).join(",") === "message:msg-a,message:msg-b",
  "message id is a deterministic tie-breaker for equal LINE timestamps");
expect(JSON.stringify(tieForward.state) === JSON.stringify(tieReverse.state),
  "equal-timestamp replay is independent of input order");

const retriedStart = structuredClone(startBooking);
retriedStart.webhookEventId = "evt-retry";
const duplicate = repository.replay({
  episodeId: EPISODE,
  records: [retriedStart, startBooking],
  tenantId: TENANT,
  userId: USER,
});
expect(duplicate.appliedRecordCount === 1 && duplicate.duplicateRecordCount === 1,
  "LINE retries with the same message id apply exactly once");
expect(duplicate.status === "complete", "identical retry records do not create a false conflict");

const conflictingRetry = structuredClone(startBooking);
conflictingRetry.turn = turn({ speechAct: "ask_clinic_info", text: "你們有幾家店" });
const conflict = repository.replay({
  episodeId: EPISODE,
  records: [startBooking, conflictingRetry],
  tenantId: TENANT,
  userId: USER,
});
expect(conflict.status === "conflict" && conflict.conflicts[0]?.identity === "message:msg-001",
  "different turns for one LINE identity surface an explicit replay conflict");
expect(conflict.appliedRecordCount === 0 && conflict.state.bookingTask.status === "inactive",
  "a conflicted identity is not chosen arbitrarily or allowed to mutate state");

const wrongSchema = { ...startBooking, schemaVersion: 999 };
const malformedTurn = {
  ...provideBranch,
  turn: { speechAct: "provide_booking_field" },
};
const zeroIndexSelection = {
  ...provideBranch,
  messageId: "msg-zero-index",
  turn: turn({ selection: { indexes: [0], mode: "indexes" } }),
};
const emptyKeySelection = {
  ...provideBranch,
  messageId: "msg-empty-keys",
  turn: turn({ selection: { keys: [], mode: "keys" } }),
};
const invalid = repository.replay({
  episodeId: EPISODE,
  records: [wrongSchema, malformedTurn, zeroIndexSelection, emptyKeySelection],
  tenantId: TENANT,
  userId: USER,
});
expect(invalid.source === "invalid_rebuilt" && invalid.invalidRecords.length === 4,
  "unsupported schemaVersion, damaged turns, and invalid selections are rejected and rebuilt safely");
expect(invalid.state.bookingTask.status === "inactive"
  && invalid.state.bookingTask.draft.phone === undefined
  && invalid.state.knowledge.treatmentKeys.length === 0,
  "invalid or missing records rebuild empty booking and knowledge state");

const missing = repository.replay({ records: [], tenantId: TENANT, userId: USER });
expect(missing.source === "missing_rebuilt" && missing.state.schemaVersion === 1,
  "missing records create a schema-versioned fresh state");

const oldEpisode = record({
  episodeId: "episode-old",
  lineTimestamp: 500,
  messageId: "msg-old",
  turn: turn({
    treatments: [{ confidence: 1, key: "botox", polarity: "affirmed", resolution: "resolved" }],
    speechAct: "learn_treatment",
    text: "想了解肉毒",
  }),
});
const latestEpisode = record({
  episodeId: "episode-new",
  lineTimestamp: 4_000,
  messageId: "msg-new",
  turn: turn({
    treatments: [{ confidence: 1, key: "onda_pro", polarity: "affirmed", resolution: "resolved" }],
    speechAct: "learn_treatment",
    text: "想了解 ONDA",
  }),
});
const productionLatest = repository.replay({
  records: [latestEpisode, oldEpisode],
  tenantId: TENANT,
  userId: USER,
});
expect(productionLatest.episodeId === "episode-new"
  && productionLatest.state.knowledge.treatmentKeys.join(",") === "onda_pro",
  "production replay selects the latest explicit episode and cannot inherit older knowledge");
expect(productionLatest.ignoredEpisodeRecordCount === 1,
  "records from older episodes are excluded from the current state");

const testFresh = repository.replay({
  isTestAccount: true,
  records: [latestEpisode],
  tenantId: TENANT,
  userId: USER,
});
expect(testFresh.source === "new_episode" && testFresh.episodeId !== "episode-new",
  "test accounts start a new episode by default");
expect(testFresh.appliedRecordCount === 0
  && testFresh.state.bookingTask.status === "inactive"
  && testFresh.state.knowledge.treatmentKeys.length === 0,
  "default test-account reset cannot inherit booking or knowledge");
const testResume = repository.replay({
  isTestAccount: true,
  records: [latestEpisode],
  tenantId: TENANT,
  testAccountEpisodeStrategy: "resume_latest",
  userId: USER,
});
expect(testResume.source === "replayed" && testResume.episodeId === "episode-new",
  "test accounts resume prior shadow records only when explicitly requested");

const foreignScope = { ...latestEpisode, tenantId: "tenant-other", userId: "user-other" };
const scoped = repository.replay({
  episodeId: EPISODE,
  records: [startBooking, foreignScope],
  tenantId: TENANT,
  userId: USER,
});
expect(scoped.ignoredScopeRecordCount === 1 && scoped.appliedRecordCount === 1,
  "tenant and user scope prevent cross-customer shadow contamination");

console.log(`conversation V2 replay repository validation passed (${passed} checks)`);
