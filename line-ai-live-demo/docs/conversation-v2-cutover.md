# Conversation V2 cutover

## Current status

This document describes the replacement target and its release gates. The
`conversation-v2` is an offline-tested decision core with a default-off runtime
shadow adapter. When both NLU shadow and Conversation V2 shadow are explicitly
enabled, it reuses the captured NLU frame, replays immutable turns in LINE
timestamp order, and records a PII-free V1/V2 comparison. It is not connected
to Production routing, live dialogue persistence, reply rendering, booking or
handoff mutations, or customer-visible delivery.

The runtime gates remain:

- `OPENAI_NLU_MODE=shadow`
- `OPENAI_NLU_DECISION_MODE=off` (shadow and canary may not run together)
- `OPENAI_NLU_SAMPLE_RATE=1` for full NLU-frame sampling; runtime replay
  snapshots remain provisional until an offline materialization pass settles
  the observation window
- `CONVERSATION_V2_MODE=shadow`

All three default to disabled or zero. Enabling them is a separately approved
Production operation; merging the code alone does not route customers through
V2. Runtime price merging is an independent legacy hardening: a known content
source error or an explicit runtime replacement now fails price output closed
instead of reviving an older seed price.

### Semantic-contract milestone (2026-08-14)

The V2 understanding contract now separates four axes that were previously
collapsed into phrases and `lastIntent`: the customer's speech act, requested
aspect, conversation move, and dialogue reference. The NLU request receives the
current message plus at most four redacted prior turns so that references such
as "that price", objections, topic replacement, and follow-up questions can be
classified without treating conversation history as instructions or clinic
facts.

The executable golden suite currently covers 40 human-labelled journeys and
111 turns, including first introduction versus follow-up, comparison,
single-versus-combination objections, explicit and subjectless pricing,
booking interruptions and resume, clinic topics, safety, handoff, duplicate
delivery, and topic replacement. These fixtures prove the policy contract and
state transitions; they do **not** prove that a live model still classifies every
phrase correctly. Recorded-model evaluation is still required before canary.

Production shadow must use a whole-conversation test-account/customer
allowlist. The current sampling gate is not approval to enable partial random
multi-turn shadow traffic; an allowlist gate must be added and separately
approved before Production activation.

### Turn-scoped clinic-facts milestone (2026-08-14)

V2 now has a provider contract for a versioned, turn-scoped clinic-facts
snapshot. The same snapshot can supply the NLU ontology and the policy's
treatment, price, and clinic-fact resolution, so a content update cannot make
the model recognize one catalog while the decision layer uses another.

The initial provider is an injectable bridge over the existing config shapes
and caller-supplied approved price records; it does not fetch runtime content by
itself. Treatment and price catalogs default to `partial`: a missing item means
`unknown`, never `not_offered`. V2 may say a treatment is unavailable only when
the snapshot carries explicit negative evidence. Likewise, a customer-visible
price exists only for an approved campaign that is current at the turn time and
has one unambiguous matching answer. Draft, missing, expired, future,
ambiguous, or unavailable price data produces no amount and requests internal
fact confirmation without pausing the conversation.

The contract supports snapshot replacement and rollback without editing the
router or dialogue policy. A future database/content-admin provider must retain
the same semantics, approval states, provenance, and per-turn snapshot pinning.
Snapshots are deep immutable, and every offered/stale/not-offered inventory key
must exist in that snapshot's recognition ontology. Recognition-only entries
are allowed and resolve to `unknown`, so adding a competitor or future treatment
name never falsely claims that the clinic offers it. When a dynamic ontology is
used, a compact recognition registry and snapshot id are stored with the NLU
frame in the existing JSON column; replay therefore does not drop newly added
treatment keys or reinterpret them through an older compiled catalog.

Price identity includes treatment set plus applicable branch, package, variant,
dose, and session count. Missing or mismatched qualifiers fail closed instead
of borrowing another branch's or package's amount. V2 never quotes the legacy
free-text `price_text`: it requires a separately approved
`customer_price_text`, while campaign name and start/end dates remain internal.
The runtime merge now preserves combination ownership and suppresses matching
seed ids before filtering an expired replacement, so an updated or withdrawn
price cannot revive an older seed value. Loading that merged catalog into the
V2 provider and enabling a customer-visible V2 canary are still separate
milestones; V2 remains default-off.

## Decision

Replace the conversation decision core without rewriting the proven LINE,
clinic-data, pricing, booking, handoff, card, and admin integrations.

Legacy routing is frozen after the immediate production fixes. New treatment
phrases, reply scripts, and conversation exceptions must not be added to
`routeCustomerMessageLegacy`. New dialogue behavior belongs in
`src/lib/conversation-v2` and must be protected by semantic-family journeys.

## Required cutover invariants

- A treatment inquiry never becomes a booking without explicit booking intent.
- A pending staff task does not own or freeze the customer's dialogue task.
- Only approved clinic data can decide availability, price, campaign content,
  branch facts, and booking mutations.
- The language model may understand and phrase a response, but it does not own
  those facts or lifecycle transitions.
- Every turn has one winning dialogue action.
- Negated entities never enter canonical knowledge, pricing ownership, or
  booking fields. The NLU adapter must distinguish true rejection from
  rhetorical negative questions before V2 can receive customer traffic.
- Booking state, dialogue state, and handoff control state are independent.
- Internal workbench links are sent only to approved LINE groups.
- A reply becomes conversation history only after delivery is confirmed. The
  current V1 hotfix removes confirmed non-deliveries; network-unknown results
  still require the durable outbox before this invariant is fully satisfied.
- Events are claimed before routing and processed in customer order. This
  requires the durable inbox described below and is not provided by V1.

## Keep

- LINE signature verification and payload adapters
- clinic ontology, approved treatment knowledge, and FAQ material
- pricing and campaign resolvers
- branch and schedule services
- booking persistence and staff handoff tasks
- promotion cards
- reply rendering and output validation
- anonymized customer journeys and existing regression tests

## Replace

- `routeCustomerMessageLegacy` and its phrase-specific priority chain
- routing decisions based on `lastIntent`
- duplicated ownership across `activeFocus`, `treatmentConsultation`, and
  `dialogueState`
- replies embedded directly in router branches
- active-pack catch-all behavior for unrelated new concerns
- instance-local production dedupe
- persisting an assistant turn before LINE confirms delivery

## Canonical V2 state

The V2 state has independent axes:

- `control`: AI active, handoff pending, human active, AI paused, or closed
- `activeTask`: idle, learn, compare, recommend, pricing, clinic info, booking,
  or safety
- `bookingTask`: create, modify, or cancel intent with inactive, collecting,
  suspended, or completed status
- `awaiting`: question id, expected field, option ids, and multiple-choice rule
- `knowledge`: confirmed treatments, concerns, areas, and approved fact ids
- `preferences`: explicit exclusions and single-treatment preference
- `pricingSubjectTreatmentKeys`: the unique owner of a subjectless price
  follow-up, kept separate from general conversation knowledge

Legacy volatile fields are not authoritative in V2. Existing customer messages,
handoff status, and explicit booking data are preserved. Polluted `lastIntent`,
`activeFocus`, and consultation routing state are repaired or reconstructed.

## Reliable turn pipeline

The production target is:

1. Verify the LINE request.
2. Atomically claim each event in a durable inbox.
3. Order events by tenant, customer, LINE timestamp, and event id.
4. Run deterministic safety and lifecycle preflight.
5. Produce structured understanding.
6. Reduce one canonical state and select one dialogue action.
7. Resolve clinic facts and build a typed reply plan.
8. Render and validate the customer-facing response.
9. Send through a durable outbox.
10. Mark the assistant turn delivered only after LINE succeeds.

The durable inbox/outbox requires a separately reviewed database migration.
Local files and in-memory locks may be used in tests, never as the Production
source of truth.

## Cutover gates

1. Immediate fixes pass screenshot-derived journeys.
2. V2 runs in record/replay without changing customer replies.
3. The NLU adapter emits explicit entity polarity, and negation-family contract
   tests pass before any customer-visible canary.
4. V1 and V2 disagreements are reviewed against the approved expected action.
5. A clinic test account uses V2 canary traffic.
6. Pricing, branch, booking, handoff, safety, and card regressions are zero.
7. V2 becomes the default with a reversible flag.
8. After a stable observation window, delete V1 and duplicated state fields.

## Required acceptance journeys

- `我要找真人接手` -> `我想了解 ONDA` stays treatment education.
- `你們有幾家店` and `想了解 ONDA` sent rapidly are each handled once and
  in customer order.
- `想了解 ONDA` -> `雙下巴` -> `都能給我看看` resolves the offered options.
- `我想知道細紋` clarifies area and dynamic versus static lines instead of
  falling back to ONDA or staff handoff.
- Explicit booking collects only the next missing field and preserves approved
  price ownership.
- Failed LINE delivery is recoverable and is not shown to later turns as a
  delivered assistant answer.
