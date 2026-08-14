# NLU shadow runbook

## Safety boundary

- `OPENAI_NLU_MODE` defaults to `off` and `OPENAI_NLU_SAMPLE_RATE` defaults to `0`.
- `CONVERSATION_V2_MODE` defaults to `off`. Its `shadow` value still cannot
  choose or render a customer reply.
- Keep `OPENAI_NLU_DECISION_MODE=off` while NLU shadow is enabled. The runtime
  rejects `shadow` plus `canary`, preventing two model requests for one message.
- Shadow output never changes the customer reply or router decision.
- Observations reference `conversation_messages.id`; they do not duplicate the customer text.
- Observation retention is 180 days. The retention sweep must delete rows whose `retention_expiry` has passed.
- Only `owner` and `maintainer` may join observations back to customer messages. `analyst` may see aggregate metrics only.

## Conversation V2 replay

Conversation V2 shadow reuses the NLU frame already captured for a customer
message; it never makes a second model request. The background sync first
persists the AI message, handoff task, and booking lead, then runs V2 as
best-effort diagnostics.

Replay uses immutable records and reconstructs state in LINE timestamp order.
It does not persist a mutable "latest V2 state", because independent `after()`
callbacks may finish out of order. Identical LINE retries are deduplicated;
conflicting versions are marked for review rather than selected arbitrarily.

The `deterministic_decision.conversationV2` envelope may contain canonical
entity keys, action families, state digests, and the names of supplied booking
fields. It must never contain customer text, booking field values, LINE user
ids, names, phone numbers, or source URLs. A hashed episode key separates old
dialogue episodes without copying the legacy episode id.

Runtime envelopes are always provisional because independent callbacks have no
durable watermark proving that every earlier event has arrived. Do not use
`coverage.complete=false` rows as settled go/no-go metrics. Build decision
metrics only after an offline materialization pass has replayed a closed
observation window in LINE timestamp order.

## Evaluation discipline

Record/replay tests prove parser, schema, prompt compilation, and deterministic decision behavior. They do **not** prove that the current hosted model still understands the original customer sentences.

Before every model or prompt-version change, run a budgeted online evaluation against the approved, de-identified golden set. Record model, prompt version, date, sample count, failures, token usage, latency p50/p95/p99, and reviewer. Do not promote production logs into the golden set without human review.

Decision mode remains out of scope until the pre-registered safety, latency, fast-path, and disagreement thresholds pass and a separate approval is recorded.
