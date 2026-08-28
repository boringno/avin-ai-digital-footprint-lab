import { evaluateDialoguePolicy } from "./policy";
import { reduceConversationV2State } from "./state";
import type { ConversationV2State, TurnUnderstanding } from "./types";
import type { ResponseContractRuntimeMode } from "@/lib/response-contract";

export type RouteConversationTurnV2Options = {
  responseContractMode?: ResponseContractRuntimeMode;
};

/**
 * The only entry point for the V2 decision core.
 *
 * Transport, persistence, NLU and clinic-domain adapters stay outside. Given a
 * canonical state and a structured turn, this function selects one action,
 * emits one typed reply plan and returns one immutable next state.
 */
export function routeConversationTurnV2(
  state: ConversationV2State,
  turn: TurnUnderstanding,
  options: RouteConversationTurnV2Options = {},
) {
  if (state.processedTurnIds.includes(turn.turnId)) {
    return {
      duplicate: true as const,
      nextState: state,
      result: null,
    };
  }

  const result = evaluateDialoguePolicy(state, turn, {
    responseContractMode: options.responseContractMode ?? "shadow",
  });
  const nextState = reduceConversationV2State(state, result.action);
  return {
    duplicate: false as const,
    nextState,
    result,
  };
}
