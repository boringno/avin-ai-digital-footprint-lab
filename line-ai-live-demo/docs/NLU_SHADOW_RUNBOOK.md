# NLU shadow runbook

## Safety boundary

- `OPENAI_NLU_MODE` defaults to `off` and `OPENAI_NLU_SAMPLE_RATE` defaults to `0`.
- Shadow output never changes the customer reply or router decision.
- Observations reference `conversation_messages.id`; they do not duplicate the customer text.
- Observation retention is 180 days. The retention sweep must delete rows whose `retention_expiry` has passed.
- Only `owner` and `maintainer` may join observations back to customer messages. `analyst` may see aggregate metrics only.

## Evaluation discipline

Record/replay tests prove parser, schema, prompt compilation, and deterministic decision behavior. They do **not** prove that the current hosted model still understands the original customer sentences.

Before every model or prompt-version change, run a budgeted online evaluation against the approved, de-identified golden set. Record model, prompt version, date, sample count, failures, token usage, latency p50/p95/p99, and reviewer. Do not promote production logs into the golden set without human review.

Decision mode remains out of scope until the pre-registered safety, latency, fast-path, and disagreement thresholds pass and a separate approval is recorded.
