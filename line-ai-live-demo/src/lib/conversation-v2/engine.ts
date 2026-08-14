import { evaluateDialoguePolicy } from "./policy";
import { reduceConversationV2State } from "./state";
import type { ConversationV2State, TurnUnderstanding } from "./types";

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
) {
  if (state.processedTurnIds.includes(turn.turnId)) {
    return {
      duplicate: true as const,
      nextState: state,
      result: null,
    };
  }

  const result = evaluateDialoguePolicy(state, turn);
  const nextState = reduceConversationV2State(state, result.action);
  return {
    duplicate: false as const,
    nextState,
    result,
  };
}
