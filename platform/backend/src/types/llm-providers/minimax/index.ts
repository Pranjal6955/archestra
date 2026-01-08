/**
 * NOTE: this is a bit of a PITA/verbose but in order to properly type everything that we are
 * proxing.. this is kinda necessary.
 *
 * the openai ts sdk doesn't expose zod schemas for all of this..
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

        // We can reuse OpenAI's chunk type as MiniMax is compatible, 
        // but strict typing might require redefining if we want to include reasoning properties.
        // For now, since we use the OpenAI SDK, we can use the OpenAI type.
        export type ChatCompletionChunk =
            OpenAIProvider.Chat.Completions.ChatCompletionChunk & {
                choices: Array<{
                    delta: {
                        reasoning_details?: Array<{ type: string; text?: string; id?: string; index?: number }>;
                    };
                }>;
            };
    }
}

export default MiniMax;
