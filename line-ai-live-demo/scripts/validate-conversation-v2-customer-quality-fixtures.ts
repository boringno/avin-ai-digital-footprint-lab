import assert from "node:assert/strict";

import {
  CONVERSATION_V2_CUSTOMER_QUALITY_FAMILIES,
  CUSTOMER_QUALITY_ANSWER_ASPECTS,
  CUSTOMER_QUALITY_DISPOSITIONS,
  CUSTOMER_QUALITY_PRIMARY_ACTIONS,
} from "./fixtures/conversation-v2-customer-quality-families";

const EXPECTED_FAMILY_IDS = Array.from(
  { length: 32 },
  (_, index) => `CQ${String(index + 1).padStart(2, "0")}`,
);

const HARD_BOUNDARY_KEYS = [
  "clarification",
  "repeatPriorReply",
  "booking",
  "handoff",
  "unapprovedFacts",
  "campaignDateVisibility",
] as const;

function assertNonEmptyText(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string") {
    assert.fail(`${label} must be a string`);
  }
  assert.ok(value.trim().length > 0, `${label} must not be empty`);
}

function assertUnique(values: readonly string[], label: string) {
  assert.equal(new Set(values).size, values.length, `${label} must be unique`);
}

function main() {
  assert.equal(
    CONVERSATION_V2_CUSTOMER_QUALITY_FAMILIES.length,
    32,
    "fixture must contain exactly 32 semantic families",
  );

  const familyIds = CONVERSATION_V2_CUSTOMER_QUALITY_FAMILIES.map(
    (family) => family.id,
  );
  assertUnique(familyIds, "family IDs");
  assert.deepEqual(
    [...familyIds].sort(),
    [...EXPECTED_FAMILY_IDS].sort(),
    "family IDs must cover CQ01 through CQ32",
  );

  const familyTitles = CONVERSATION_V2_CUSTOMER_QUALITY_FAMILIES.map(
    (family) => family.title,
  );
  assertUnique(familyTitles, "family titles");

  const variantIds: string[] = [];
  const normalizedTurnSequences: string[] = [];

  for (const family of CONVERSATION_V2_CUSTOMER_QUALITY_FAMILIES) {
    assertNonEmptyText(family.title, `${family.id}.title`);
    assert.ok(
      family.variants.length >= 3,
      `${family.id} must contain at least three natural-language variants`,
    );

    for (const variant of family.variants) {
      const label = `${family.id}/${variant.id}`;
      variantIds.push(variant.id);

      assert.ok(
        variant.id.startsWith(`${family.id}-V`),
        `${label} variant ID must be namespaced by its family ID`,
      );
      assertNonEmptyText(variant.title, `${label}.title`);
      assert.ok(
        variant.turns.length >= 2 && variant.turns.length <= 6,
        `${label} must contain 2-6 turns so this remains a multi-turn fixture`,
      );
      variant.turns.forEach((turn, index) => {
        assertNonEmptyText(turn, `${label}.turns[${index}]`);
        assert.ok(turn.length <= 500, `${label}.turns[${index}] is unexpectedly long`);
      });
      normalizedTurnSequences.push(
        variant.turns.map((turn) => turn.trim()).join("\u241f"),
      );

      assert.ok(
        CUSTOMER_QUALITY_PRIMARY_ACTIONS.includes(variant.expected.primaryAction),
        `${label} has an unsupported primary action`,
      );
      assert.ok(
        variant.expected.mustAnswerAspects.length > 0,
        `${label} must declare at least one must-answer aspect`,
      );
      assertUnique(
        [...variant.expected.mustAnswerAspects],
        `${label}.mustAnswerAspects`,
      );
      for (const aspect of variant.expected.mustAnswerAspects) {
        assert.ok(
          CUSTOMER_QUALITY_ANSWER_ASPECTS.includes(aspect),
          `${label} has an unsupported must-answer aspect: ${aspect}`,
        );
      }

      for (const key of HARD_BOUNDARY_KEYS) {
        assert.ok(
          Object.prototype.hasOwnProperty.call(variant.expected, key),
          `${label} is missing hard-boundary marker: ${key}`,
        );
      }
      assert.ok(
        CUSTOMER_QUALITY_DISPOSITIONS.includes(variant.expected.clarification),
        `${label} has an invalid clarification disposition`,
      );
      assert.ok(
        CUSTOMER_QUALITY_DISPOSITIONS.includes(variant.expected.booking),
        `${label} has an invalid booking disposition`,
      );
      assert.ok(
        CUSTOMER_QUALITY_DISPOSITIONS.includes(variant.expected.handoff),
        `${label} has an invalid handoff disposition`,
      );
      assert.equal(
        variant.expected.repeatPriorReply,
        "forbidden",
        `${label} must forbid repeating the prior reply`,
      );
      assert.equal(
        variant.expected.unapprovedFacts,
        "forbidden",
        `${label} must forbid unapproved facts`,
      );
      assert.equal(
        variant.expected.campaignDateVisibility,
        "forbidden",
        `${label} must forbid customer-visible campaign dates`,
      );

      if (variant.expected.primaryAction === "clarify") {
        assert.equal(
          variant.expected.clarification,
          "required",
          `${label} clarify action must require clarification`,
        );
      }
      if (
        variant.expected.primaryAction === "start_booking" ||
        variant.expected.primaryAction === "manage_booking"
      ) {
        assert.equal(
          variant.expected.booking,
          "required",
          `${label} booking action must require booking progression`,
        );
      }
      if (variant.expected.primaryAction === "queue_handoff") {
        assert.equal(
          variant.expected.handoff,
          "required",
          `${label} handoff action must require a handoff`,
        );
      }
      if (variant.expected.primaryAction === "answer_safety") {
        assert.ok(
          variant.expected.mustAnswerAspects.includes("urgent_instruction"),
          `${label} safety action must answer the urgent instruction aspect`,
        );
      }
    }
  }

  assertUnique(variantIds, "variant IDs");
  assertUnique(normalizedTurnSequences, "normalized turn sequences");

  console.log(
    `PASS: Conversation V2 customer-quality fixture schema (${familyIds.length} families / ${variantIds.length} variants)`,
  );
  console.log("NOTE: schema-only validation; no live model or customer reply was evaluated");
}

main();
