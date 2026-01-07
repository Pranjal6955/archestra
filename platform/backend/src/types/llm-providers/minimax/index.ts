/**
 * MiniMax provider type definitions
 * 
 * MiniMax provides an OpenAI-compatible API, so the types are similar to OpenAI.
 */
import type OpenAIProvider from "openai";
import type { z } from "zod";
import * as MiniMaxAPI from "./api";
import * as MiniMaxMessages from "./messages";
import * as MiniMaxTools from "./tools";

namespace MiniMax {
  export const API = MiniMaxAPI;
  export const Messages = MiniMaxMessages;
  export const Tools = MiniMaxTools;

  export namespace Types {
    export type ChatCompletionsHeaders = z.infer<
      typeof MiniMaxAPI.ChatCompletionsHeadersSchema
    >;
    export type ChatCompletionsRequest = z.infer<
      typeof MiniMaxAPI.ChatCompletionRequestSchema
    >;
    export type ChatCompletionsResponse = z.infer<
      typeof MiniMaxAPI.ChatCompletionResponseSchema
    >;
    export type Usage = z.infer<typeof MiniMaxAPI.ChatCompletionUsageSchema>;

    export type FinishReason = z.infer<typeof MiniMaxAPI.FinishReasonSchema>;
    export type Message = z.infer<typeof MiniMaxMessages.MessageParamSchema>;
    export type Role = Message["role"];

    // Use OpenAI's ChatCompletionChunk type but extend with MiniMax-specific fields
    export type ChatCompletionChunk =
      OpenAIProvider.Chat.Completions.ChatCompletionChunk & {
        choices: Array<{
          delta: {
            reasoning_details?: Array<{
              text: string;
            }>;
          };
        }>;
      };
  }
}

export default MiniMax;

