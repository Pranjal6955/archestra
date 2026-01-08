import { describe, expect, test } from "@/test";
import type { MiniMax } from "@/types";
import { minimaxAdapterFactory } from "./minimax";

function createMockResponse(
    message: MiniMax.Types.ChatCompletionsResponse["choices"][0]["message"],
    usage?: Partial<MiniMax.Types.Usage>,
): MiniMax.Types.ChatCompletionsResponse {
    return {
        id: "chatcmpl-test",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "MiniMax-M2",
        choices: [
            {
                index: 0,
                message: {
                    refusal: null,
                    role: message.role,
                    content: message.content ?? null,
                    tool_calls: message.tool_calls,
                },
                logprobs: null,
                finish_reason: message.tool_calls ? "tool_calls" : "stop",
            },
        ],
        usage: {
            prompt_tokens: usage?.prompt_tokens ?? 100,
            completion_tokens: usage?.completion_tokens ?? 50,
            total_tokens:
                (usage?.prompt_tokens ?? 100) + (usage?.completion_tokens ?? 50),
        },
    };
}

function createMockRequest(
    messages: MiniMax.Types.ChatCompletionsRequest["messages"],
    options?: Partial<MiniMax.Types.ChatCompletionsRequest>,
): MiniMax.Types.ChatCompletionsRequest {
    return {
        model: "MiniMax-M2",
        messages,
        ...options,
    };
}

describe("MiniMaxResponseAdapter", () => {
    describe("getToolCalls", () => {
        test("converts function tool calls to common format", () => {
            const response = createMockResponse({
                role: "assistant",
                content: null,
                tool_calls: [
                    {
                        id: "call_123",
                        type: "function",
                        function: {
                            name: "test_tool",
                            arguments: '{"param1": "value1", "param2": 42}',
                        },
                    },
                ],
            });

            const adapter = minimaxAdapterFactory.createResponseAdapter(response);
            const result = adapter.getToolCalls();

            expect(result).toEqual([
                {
                    id: "call_123",
                    name: "test_tool",
                    arguments: { param1: "value1", param2: 42 },
                },
            ]);
        });

        test("converts custom tool calls to common format", () => {
            const response = createMockResponse({
                role: "assistant",
                content: null,
                tool_calls: [
                    {
                        id: "call_456",
                        type: "custom",
                        custom: {
                            name: "custom_tool",
                            input: '{"data": "test"}',
                        },
                    },
                ],
            });

            const adapter = minimaxAdapterFactory.createResponseAdapter(response);
            const result = adapter.getToolCalls();

            expect(result).toEqual([
                {
                    id: "call_456",
                    name: "custom_tool",
                    arguments: { data: "test" },
                },
            ]);
        });

        test("handles invalid JSON in arguments gracefully", () => {
            const response = createMockResponse({
                role: "assistant",
                content: null,
                tool_calls: [
                    {
                        id: "call_789",
                        type: "function",
                        function: {
                            name: "broken_tool",
                            arguments: "invalid json{",
                        },
                    },
                ],
            });

            const adapter = minimaxAdapterFactory.createResponseAdapter(response);
            const result = adapter.getToolCalls();

            expect(result).toEqual([
                {
                    id: "call_789",
                    name: "broken_tool",
                    arguments: {},
                },
            ]);
        });

        test("handles multiple tool calls", () => {
            const response = createMockResponse({
                role: "assistant",
                content: null,
                tool_calls: [
                    {
                        id: "call_1",
                        type: "function",
                        function: {
                            name: "tool_one",
                            arguments: '{"param": "value1"}',
                        },
                    },
                    {
                        id: "call_2",
                        type: "function",
                        function: {
                            name: "tool_two",
                            arguments: '{"param": "value2"}',
                        },
                    },
                ],
            });

            const adapter = minimaxAdapterFactory.createResponseAdapter(response);
            const result = adapter.getToolCalls();

            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({
                id: "call_1",
                name: "tool_one",
                arguments: { param: "value1" },
            });
            expect(result[1]).toEqual({
                id: "call_2",
                name: "tool_two",
                arguments: { param: "value2" },
            });
        });

        test("handles empty arguments", () => {
            const response = createMockResponse({
                role: "assistant",
                content: null,
                tool_calls: [
                    {
                        id: "call_empty",
                        type: "function",
                        function: {
                            name: "empty_tool",
                            arguments: "{}",
                        },
                    },
                ],
            });

            const adapter = minimaxAdapterFactory.createResponseAdapter(response);
            const result = adapter.getToolCalls();

            expect(result).toEqual([
                {
                    id: "call_empty",
                    name: "empty_tool",
                    arguments: {},
                },
            ]);
        });
    });

    describe("getText", () => {
        test("extracts text content from response", () => {
            const response = createMockResponse({
                role: "assistant",
                content: "Hello, world!",
            });

            const adapter = minimaxAdapterFactory.createResponseAdapter(response);
            expect(adapter.getText()).toBe("Hello, world!");
        });

        test("returns empty string when content is null", () => {
            const response = createMockResponse({
                role: "assistant",
                content: null,
            });

            const adapter = minimaxAdapterFactory.createResponseAdapter(response);
            expect(adapter.getText()).toBe("");
        });
    });

    describe("getUsage", () => {
        test("extracts usage tokens from response", () => {
            const response = createMockResponse(
                { role: "assistant", content: "Test" },
                { prompt_tokens: 150, completion_tokens: 75 },
            );

            const adapter = minimaxAdapterFactory.createResponseAdapter(response);
            const usage = adapter.getUsage();

            expect(usage).toEqual({
                inputTokens: 150,
                outputTokens: 75,
            });
        });
    });

    describe("toRefusalResponse", () => {
        test("creates refusal response with provided message", () => {
            const response = createMockResponse({
                role: "assistant",
                content: "Original content",
            });

            const adapter = minimaxAdapterFactory.createResponseAdapter(response);
            const refusal = adapter.toRefusalResponse(
                "Full refusal",
                "Tool call blocked by policy",
            );

            expect(refusal.choices[0].message.content).toBe(
                "Tool call blocked by policy",
            );
            expect(refusal.choices[0].finish_reason).toBe("stop");
        });
    });
});

describe("MiniMaxRequestAdapter", () => {
    describe("getModel", () => {
        test("returns original model by default", () => {
            const request = createMockRequest([{ role: "user", content: "Hello" }], {
                model: "MiniMax-M2.1",
            });

            const adapter = minimaxAdapterFactory.createRequestAdapter(request);
            expect(adapter.getModel()).toBe("MiniMax-M2.1");
        });

        test("returns modified model after setModel", () => {
            const request = createMockRequest([{ role: "user", content: "Hello" }], {
                model: "MiniMax-M2",
            });

            const adapter = minimaxAdapterFactory.createRequestAdapter(request);
            adapter.setModel("MiniMax-M2.1");
            expect(adapter.getModel()).toBe("MiniMax-M2.1");
        });
    });

    describe("isStreaming", () => {
        test("returns true when stream is true", () => {
            const request = createMockRequest([{ role: "user", content: "Hello" }], {
                stream: true,
            });

            const adapter = minimaxAdapterFactory.createRequestAdapter(request);
            expect(adapter.isStreaming()).toBe(true);
        });

        test("returns false when stream is false", () => {
            const request = createMockRequest([{ role: "user", content: "Hello" }], {
                stream: false,
            });

            const adapter = minimaxAdapterFactory.createRequestAdapter(request);
            expect(adapter.isStreaming()).toBe(false);
        });

        test("returns false when stream is undefined", () => {
            const request = createMockRequest([{ role: "user", content: "Hello" }]);

            const adapter = minimaxAdapterFactory.createRequestAdapter(request);
            expect(adapter.isStreaming()).toBe(false);
        });
    });

    describe("getTools", () => {
        test("extracts function tools from request", () => {
            const request = createMockRequest([{ role: "user", content: "Hello" }], {
                tools: [
                    {
                        type: "function",
                        function: {
                            name: "get_weather",
                            description: "Get weather for a location",
                            parameters: {
                                type: "object",
                                properties: {
                                    location: { type: "string" },
                                },
                            },
                        },
                    },
                ],
            });

            const adapter = minimaxAdapterFactory.createRequestAdapter(request);
            const tools = adapter.getTools();

            expect(tools).toEqual([
                {
                    name: "get_weather",
                    description: "Get weather for a location",
                    inputSchema: {
                        type: "object",
                        properties: {
                            location: { type: "string" },
                        },
                    },
                },
            ]);
        });

        test("returns empty array when no tools", () => {
            const request = createMockRequest([{ role: "user", content: "Hello" }]);

            const adapter = minimaxAdapterFactory.createRequestAdapter(request);
            expect(adapter.getTools()).toEqual([]);
        });
    });

    describe("getMessages", () => {
        test("converts tool messages to common format", () => {
            const request = createMockRequest([
                { role: "user", content: "Get the weather" },
                {
                    role: "assistant",
                    content: null,
                    tool_calls: [
                        {
                            id: "call_123",
                            type: "function",
                            function: {
                                name: "get_weather",
                                arguments: '{"location": "NYC"}',
                            },
                        },
                    ],
                },
                {
                    role: "tool",
                    tool_call_id: "call_123",
                    content: '{"temperature": 72, "unit": "fahrenheit"}',
                },
            ]);

            const adapter = minimaxAdapterFactory.createRequestAdapter(request);
            const messages = adapter.getMessages();

            expect(messages).toHaveLength(3);
            expect(messages[2].toolCalls).toEqual([
                {
                    id: "call_123",
                    name: "get_weather",
                    content: { temperature: 72, unit: "fahrenheit" },
                    isError: false,
                },
            ]);
        });
    });

    describe("toProviderRequest", () => {
        test("applies model change to request", () => {
            const request = createMockRequest([{ role: "user", content: "Hello" }], {
                model: "MiniMax-M2",
            });

            const adapter = minimaxAdapterFactory.createRequestAdapter(request);
            adapter.setModel("MiniMax-M2.1");
            const result = adapter.toProviderRequest();

            expect(result.model).toBe("MiniMax-M2.1");
        });

        test("applies tool result updates to request", () => {
            const request = createMockRequest([
                { role: "user", content: "Get the weather" },
                {
                    role: "assistant",
                    content: null,
                    tool_calls: [
                        {
                            id: "call_123",
                            type: "function",
                            function: {
                                name: "get_weather",
                                arguments: '{"location": "NYC"}',
                            },
                        },
                    ],
                },
                {
                    role: "tool",
                    tool_call_id: "call_123",
                    content: '{"temperature": 72}',
                },
            ]);

            const adapter = minimaxAdapterFactory.createRequestAdapter(request);
            adapter.updateToolResult(
                "call_123",
                '{"temperature": 75, "note": "updated"}',
            );
            const result = adapter.toProviderRequest();

            const toolMessage = result.messages.find((m) => m.role === "tool");
            expect(toolMessage?.content).toBe(
                '{"temperature": 75, "note": "updated"}',
            );
        });
    });
});

describe("minimaxAdapterFactory", () => {
    describe("extractApiKey", () => {
        test("returns authorization header as-is", () => {
            const headers = { authorization: "Bearer sk-test-key-123" };
            const apiKey = minimaxAdapterFactory.extractApiKey(headers);
            expect(apiKey).toBe("Bearer sk-test-key-123");
        });

        test("returns undefined when no authorization header", () => {
            const headers = {} as unknown as MiniMax.Types.ChatCompletionsHeaders;
            const apiKey = minimaxAdapterFactory.extractApiKey(headers);
            expect(apiKey).toBeUndefined();
        });
    });

    describe("provider info", () => {
        test("has correct provider name", () => {
            expect(minimaxAdapterFactory.provider).toBe("minimax");
        });

        test("has correct interaction type", () => {
            expect(minimaxAdapterFactory.interactionType).toBe(
                "minimax:chatCompletions",
            );
        });
    });
});
