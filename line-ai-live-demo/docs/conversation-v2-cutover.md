# Conversation V2 cutover

## Current status

This document describes the replacement target and its release gates. The
`conversation-v2` module is currently a pure, offline-tested decision core. It
is not connected to Production routing, persistence, NLU, reply delivery, or a
customer-visible feature flag yet.

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
