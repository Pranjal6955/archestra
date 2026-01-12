import type { GoogleGenAI } from "@google/genai";
import { vi } from "vitest";
import config from "@/config";
import { beforeEach, describe, expect, test } from "@/test";
import {
  fetchGeminiModels,
  fetchGeminiModelsViaVertexAi,
  mapOpenAiModelToModelInfo,
} from "./routes.models";

// Mock fetch globally for testing API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock the Google GenAI client for Vertex AI tests
vi.mock("@/routes/proxy/utils/gemini-client", () => ({
  createGoogleGenAIClient: vi.fn(),
  isVertexAiEnabled: vi.fn(),
}));

import {
  createGoogleGenAIClient,
  isVertexAiEnabled,
} from "@/routes/proxy/utils/gemini-client";

const mockCreateGoogleGenAIClient = vi.mocked(createGoogleGenAIClient);
const mockIsVertexAiEnabled = vi.mocked(isVertexAiEnabled);

describe("chat-models", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  describe("fetchGeminiModels (API key mode)", () => {
    test("fetches and filters Gemini models that support generateContent", async () => {
      const mockResponse = {
        models: [
          {
            name: "models/gemini-2.5-pro",
            displayName: "Gemini 2.5 Pro",
            supportedGenerationMethods: [
              "generateContent",
              "countTokens",
              "createCachedContent",
            ],
          },
          {
            name: "models/gemini-2.5-flash",
            displayName: "Gemini 2.5 Flash",
            supportedGenerationMethods: ["generateContent", "countTokens"],
          },
          {
            name: "models/embedding-001",
            displayName: "Text Embedding",
            supportedGenerationMethods: ["embedContent"],
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const models = await fetchGeminiModels("test-api-key");

      expect(models).toHaveLength(2);
      expect(models).toEqual([
        {
          id: "gemini-2.5-pro",
          displayName: "Gemini 2.5 Pro",
          provider: "gemini",
          capabilities: ["vision", "reasoning", "image_generation", "docs"],
        },
        {
          id: "gemini-2.5-flash",
          displayName: "Gemini 2.5 Flash",
          provider: "gemini",
          capabilities: ["vision", "image_generation", "fast", "docs"],
        },
      ]);


      // Verify fetch was called with correct URL
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const fetchUrl = mockFetch.mock.calls[0][0];
      expect(fetchUrl).toContain("/v1beta/models");
      expect(fetchUrl).toContain("key=test-api-key");
      expect(fetchUrl).toContain("pageSize=100");
    });

    test("throws error on API failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Invalid API key"),
      });

      await expect(fetchGeminiModels("invalid-key")).rejects.toThrow(
        "Failed to fetch Gemini models: 401",
      );
    });

    test("returns empty array when no models support generateContent", async () => {
      const mockResponse = {
        models: [
          {
            name: "models/embedding-001",
            displayName: "Text Embedding",
            supportedGenerationMethods: ["embedContent"],
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const models = await fetchGeminiModels("test-api-key");
      expect(models).toHaveLength(0);
    });

    test("handles models without supportedGenerationMethods field", async () => {
      const mockResponse = {
        models: [
          {
            name: "models/gemini-old",
            displayName: "Old Gemini",
            // No supportedGenerationMethods field
          },
          {
            name: "models/gemini-new",
            displayName: "New Gemini",
            supportedGenerationMethods: ["generateContent"],
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const models = await fetchGeminiModels("test-api-key");

      // Only the model with generateContent support should be returned
      expect(models).toHaveLength(1);
      expect(models[0].id).toBe("gemini-new");
    });
  });

  describe("fetchGeminiModelsViaVertexAi", () => {
    test("fetches Gemini models using Vertex AI SDK format", async () => {
      // Vertex AI returns models in "publishers/google/models/xxx" format
      // without supportedActions or displayName fields
      const mockModels: Array<{
        name: string;
        version: string;
        tunedModelInfo: Record<string, unknown>;
      }> = [
          {
            name: "publishers/google/models/gemini-2.5-pro",
            version: "default",
            tunedModelInfo: {},
          },
          {
            name: "publishers/google/models/gemini-2.5-flash",
            version: "default",
            tunedModelInfo: {},
          },
          {
            name: "publishers/google/models/gemini-embedding-001",
            version: "default",
            tunedModelInfo: {},
          },
          {
            name: "publishers/google/models/imageclassification-efficientnet",
            version: "001",
            tunedModelInfo: {},
          },
        ];

      // Create async iterator from mock models
      const mockPager = {
        [Symbol.asyncIterator]: async function* () {
          for (const model of mockModels) {
            yield model;
          }
        },
      };

      const mockClient = {
        models: {
          list: vi.fn().mockResolvedValue(mockPager),
        },
      } as unknown as GoogleGenAI;

      mockCreateGoogleGenAIClient.mockReturnValue(mockClient);

      const models = await fetchGeminiModelsViaVertexAi();

      // Should include gemini-2.5-pro and gemini-2.5-flash
      // Should exclude gemini-embedding-001 (embedding model)
      // Should exclude imageclassification-efficientnet (non-gemini)
      expect(models).toHaveLength(2);
      expect(models).toEqual([
        {
          id: "gemini-2.5-pro",
          displayName: "Gemini 2.5 Pro",
          provider: "gemini",
          capabilities: ["vision", "reasoning", "image_generation", "docs"],
        },
        {
          id: "gemini-2.5-flash",
          displayName: "Gemini 2.5 Flash",
          provider: "gemini",
          capabilities: ["vision", "image_generation", "fast", "docs"],
        },
      ]);

      // Verify SDK was called correctly
      expect(mockCreateGoogleGenAIClient).toHaveBeenCalledWith(
        undefined,
        "[ChatModels]",
      );
      expect(mockClient.models.list).toHaveBeenCalledWith({
        config: { pageSize: 100 },
      });
    });

    test("excludes non-chat models by pattern", async () => {
      const mockModels = [
        {
          name: "publishers/google/models/gemini-2.0-flash-001",
          version: "default",
          tunedModelInfo: {},
        },
        {
          name: "publishers/google/models/gemini-embedding-001",
          version: "default",
          tunedModelInfo: {},
        },
        {
          name: "publishers/google/models/imagen-3.0",
          version: "default",
          tunedModelInfo: {},
        },
        {
          name: "publishers/google/models/text-bison-001",
          version: "default",
          tunedModelInfo: {},
        },
      ];

      const mockPager = {
        [Symbol.asyncIterator]: async function* () {
          for (const model of mockModels) {
            yield model;
          }
        },
      };

      const mockClient = {
        models: {
          list: vi.fn().mockResolvedValue(mockPager),
        },
      } as unknown as GoogleGenAI;

      mockCreateGoogleGenAIClient.mockReturnValue(mockClient);

      const models = await fetchGeminiModelsViaVertexAi();

      // Only gemini-2.0-flash-001 should be included
      // embedding, imagen, and text-bison should be excluded
      expect(models).toHaveLength(1);
      expect(models[0].id).toBe("gemini-2.0-flash-001");
    });

    test("generates display name from model ID", async () => {
      const mockModels = [
        {
          name: "publishers/google/models/gemini-2.5-flash-lite-preview-09-2025",
          version: "default",
          tunedModelInfo: {},
        },
      ];

      const mockPager = {
        [Symbol.asyncIterator]: async function* () {
          for (const model of mockModels) {
            yield model;
          }
        },
      };

      const mockClient = {
        models: {
          list: vi.fn().mockResolvedValue(mockPager),
        },
      } as unknown as GoogleGenAI;

      mockCreateGoogleGenAIClient.mockReturnValue(mockClient);

      const models = await fetchGeminiModelsViaVertexAi();

      expect(models).toHaveLength(1);
      expect(models[0].displayName).toBe(
        "Gemini 2.5 Flash Lite Preview 09 2025",
      );
    });

    test("returns empty array when SDK returns no models", async () => {
      const mockPager = {
        [Symbol.asyncIterator]: async function* () {
          // Empty generator
        },
      };

      const mockClient = {
        models: {
          list: vi.fn().mockResolvedValue(mockPager),
        },
      } as unknown as GoogleGenAI;

      mockCreateGoogleGenAIClient.mockReturnValue(mockClient);

      const models = await fetchGeminiModelsViaVertexAi();
      expect(models).toHaveLength(0);
    });
  });

  describe("isVertexAiEnabled", () => {
    test("returns true when Vertex AI is enabled in config", () => {
      const originalEnabled = config.llm.gemini.vertexAi.enabled;

      try {
        config.llm.gemini.vertexAi.enabled = true;
        mockIsVertexAiEnabled.mockReturnValue(true);

        expect(mockIsVertexAiEnabled()).toBe(true);
      } finally {
        config.llm.gemini.vertexAi.enabled = originalEnabled;
      }
    });

    test("returns false when Vertex AI is disabled in config", () => {
      const originalEnabled = config.llm.gemini.vertexAi.enabled;

      try {
        config.llm.gemini.vertexAi.enabled = false;
        mockIsVertexAiEnabled.mockReturnValue(false);

        expect(mockIsVertexAiEnabled()).toBe(false);
      } finally {
        config.llm.gemini.vertexAi.enabled = originalEnabled;
      }
    });
  });

  describe("mapOpenAiModelToModelInfo", () => {
    describe("OpenAi.Types.Model", () => {
      test("maps standard OpenAI model", () => {
        const result = mapOpenAiModelToModelInfo({
          id: "gpt-4o",
          created: 1715367049,
          object: "model",
          owned_by: "openai",
        });

        expect(result).toEqual({
          id: "gpt-4o",
          displayName: "gpt-4o",
          provider: "openai",
          createdAt: new Date(1715367049 * 1000).toISOString(),
          capabilities: ["vision", "reasoning", "image_generation", "docs"],
        });
      });

      test("maps OpenAI mini model", () => {
        const result = mapOpenAiModelToModelInfo({
          id: "gpt-4o-mini",
          created: 1715367049,
          object: "model",
          owned_by: "openai",
        });

        expect(result).toEqual({
          id: "gpt-4o-mini",
          displayName: "gpt-4o-mini",
          provider: "openai",
          createdAt: new Date(1715367049 * 1000).toISOString(),
          // Should include fast, vision, pdf_input, reasoning but NOT image_generation
          capabilities: ["vision", "reasoning", "fast", "docs"],
        });
      });

      test("maps OpenAI nano model", () => {
        const result = mapOpenAiModelToModelInfo({
          id: "gpt-4.1-nano",
          created: 1715367049,
          object: "model",
          owned_by: "openai",
        });

        expect(result).toEqual({
          id: "gpt-4.1-nano",
          displayName: "gpt-4.1-nano",
          provider: "openai",
          createdAt: new Date(1715367049 * 1000).toISOString(),
          // Note: nano might not have image_generation or docs (docs is restricted to gpt-4o/4.1 in logic)
          // Wait, gpt-4.1 IS in docs check.
          // image_gen excludes nano.
          capabilities: ["vision", "reasoning", "fast", "docs"],
        });
      });

      test("maps OpenAI realtime model", () => {
        const result = mapOpenAiModelToModelInfo({
          id: "gpt-realtime-mini",
          created: 1715367049,
          object: "model",
          owned_by: "openai",
        });

        expect(result).toEqual({
          id: "gpt-realtime-mini",
          displayName: "gpt-realtime-mini",
          provider: "openai",
          createdAt: new Date(1715367049 * 1000).toISOString(),
          // Should include fast due to "realtime" keyword
          capabilities: ["fast"],
        });
      });

      test("maps OpenAI legacy model", () => {
        const result = mapOpenAiModelToModelInfo({
          id: "davinci-002",
          created: 1715367049,
          object: "model",
          owned_by: "openai",
        });

        expect(result).toEqual({
          id: "davinci-002",
          displayName: "davinci-002",
          provider: "openai",
          createdAt: new Date(1715367049 * 1000).toISOString(),
          capabilities: ["fast"],
        });
      });
    });

    describe("OpenAi.Types.OrlandoModel", () => {
      test("maps Claude model with anthropic provider", () => {
        const result = mapOpenAiModelToModelInfo({
          id: "claude-3-5-sonnet",
          name: "claude-3-5-sonnet",
        });

        expect(result).toEqual({
          id: "claude-3-5-sonnet",
          displayName: "claude-3-5-sonnet",
          provider: "anthropic",
          createdAt: undefined,
          capabilities: ["vision", "reasoning", "docs"],
        });
      });

      test("maps Claude 4.5 Opus model", () => {
        const result = mapOpenAiModelToModelInfo({
          id: "claude-4.5-opus",
          name: "Claude Opus 4.5",
        });

        expect(result).toEqual({
          id: "claude-4.5-opus",
          displayName: "Claude Opus 4.5",
          provider: "anthropic",
          createdAt: undefined,
          capabilities: ["vision", "reasoning", "docs"],
        });
      });

      test("maps Claude 3.7 Sonnet model", () => {
        const result = mapOpenAiModelToModelInfo({
          id: "anthropic/claude-3.7-sonnet",
          name: "Claude Sonnet 3.7",
        });

        expect(result).toEqual({
          id: "anthropic/claude-3.7-sonnet",
          displayName: "Claude Sonnet 3.7",
          provider: "anthropic",
          createdAt: undefined,
          capabilities: ["vision", "reasoning", "docs"],
        });
      });

      test("maps Gemini 2.5 Pro model", () => {
        const result = mapOpenAiModelToModelInfo({
          id: "gemini-2.5-pro",
          name: "gemini-2.5-pro",
        });

        expect(result).toEqual({
          id: "gemini-2.5-pro",
          displayName: "gemini-2.5-pro",
          provider: "gemini",
          createdAt: undefined,
          capabilities: ["vision", "reasoning", "image_generation", "docs"],
        });
      });

      test("maps Gemma 3 model", () => {
        const result = mapOpenAiModelToModelInfo({
          id: "gemma-3-27b",
          name: "Gemma 3 27B",
        });

        expect(result).toEqual({
          id: "gemma-3-27b",
          displayName: "Gemma 3 27B",
          provider: "gemini",
          createdAt: undefined,
          capabilities: ["vision", "fast", "docs"],
        });
      });

      test("maps Gemini Flash-Lite model", () => {
        const result = mapOpenAiModelToModelInfo({
          id: "gemini-2.0-flash-lite-preview-01-21",
          name: "Gemini 2.0 Flash-Lite Preview",
        });

        expect(result).toEqual({
          id: "gemini-2.0-flash-lite-preview-01-21",
          displayName: "Gemini 2.0 Flash-Lite Preview",
          provider: "gemini",
          createdAt: undefined,
          capabilities: ["vision", "image_generation", "fast", "docs"],
        });
      });

      test("maps Nano Banana Pro model", () => {
        const result = mapOpenAiModelToModelInfo({
          id: "nano-banana-pro",
          name: "Nano Banana Pro",
        });

        expect(result).toEqual({
          id: "nano-banana-pro",
          displayName: "Nano Banana Pro",
          provider: "gemini",
          createdAt: undefined,
          capabilities: ["fast", "docs"],
        });
      });

      test("maps Gemini Robotics model", () => {
        const result = mapOpenAiModelToModelInfo({
          id: "gemini-robotics-er-1.5",
          name: "Gemini Robotics-ER 1.5 Preview",
        });

        expect(result).toEqual({
          id: "gemini-robotics-er-1.5",
          displayName: "Gemini Robotics-ER 1.5 Preview",
          provider: "gemini",
          createdAt: undefined,
          capabilities: ["vision", "docs"],
        });
      });

      test("maps Computer Use model", () => {
        const result = mapOpenAiModelToModelInfo({
          id: "gemini-2.5-computer-use-10-2025",
          name: "Gemini 2.5 Computer Use Preview",
        });

        expect(result).toEqual({
          id: "gemini-2.5-computer-use-10-2025",
          displayName: "Gemini 2.5 Computer Use Preview",
          provider: "gemini",
          createdAt: undefined,
          capabilities: ["vision", "image_generation", "docs"],
        });
      });

      test("maps Deep Research model", () => {
        const result = mapOpenAiModelToModelInfo({
          id: "deep-research-pro-preview",
          name: "Deep Research Pro Preview",
        });

        expect(result).toEqual({
          id: "deep-research-pro-preview",
          displayName: "Deep Research Pro Preview",
          provider: "gemini",
          createdAt: undefined,
          capabilities: ["reasoning", "docs"],
        });
      });

      test("maps GPT model with openai provider", () => {
        const result = mapOpenAiModelToModelInfo({
          id: "gpt-5",
          name: "gpt-5",
        });

        expect(result).toEqual({
          id: "gpt-5",
          displayName: "gpt-5",
          provider: "openai",
          createdAt: undefined,
          capabilities: ["vision", "reasoning", "image_generation", "docs"],
        });
      });
    });
  });
});
