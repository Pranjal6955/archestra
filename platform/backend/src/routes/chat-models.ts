import {
  RouteId,
  type SupportedProvider,
  SupportedProviders,
  TimeInMs,
} from "@shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { CacheKey, cacheManager } from "@/cache-manager";
import config from "@/config";
import logger from "@/logging";
import { ChatApiKeyModel, TeamModel } from "@/models";
import { isVertexAiEnabled } from "@/routes/proxy/utils/gemini-client";
import { getSecretValueForLlmProviderApiKey } from "@/secrets-manager";
import { constructResponseSchema, SupportedChatProviderSchema } from "@/types";

/** TTL for caching chat models from provider APIs */
const CHAT_MODELS_CACHE_TTL_MS = TimeInMs.Hour * 2;
const CHAT_MODELS_CACHE_TTL_HOURS = CHAT_MODELS_CACHE_TTL_MS / TimeInMs.Hour;

// Response schema for models
const ChatModelSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  provider: SupportedChatProviderSchema,
  createdAt: z.string().optional(),
});

export interface ModelInfo {
  id: string;
  displayName: string;
  provider: SupportedProvider;
  createdAt?: string;
}

/**
 * Fetch models from Anthropic API
 */
async function fetchAnthropicModels(apiKey: string): Promise<ModelInfo[]> {
  const baseUrl = config.chat.anthropic.baseUrl;
  const url = `${baseUrl}/v1/models?limit=100`;

  const response = await fetch(url, {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(
      { status: response.status, error: errorText },
      "Failed to fetch Anthropic models",
    );
    throw new Error(`Failed to fetch Anthropic models: ${response.status}`);
  }

  const data = (await response.json()) as {
    data: Array<{
      id: string;
      display_name: string;
      created_at?: string;
    }>;
  };

  // All Anthropic models are chat models, no filtering needed
  return data.data.map((model) => ({
    id: model.id,
    displayName: model.display_name,
    provider: "anthropic" as const,
    createdAt: model.created_at,
  }));
}

/**
 * Fetch models from OpenAI API
 */
async function fetchOpenAiModels(apiKey: string): Promise<ModelInfo[]> {
  const baseUrl = config.chat.openai.baseUrl;
  const url = `${baseUrl}/models`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(
      { status: response.status, error: errorText },
      "Failed to fetch OpenAI models",
    );
    throw new Error(`Failed to fetch OpenAI models: ${response.status}`);
  }

  const data = (await response.json()) as {
    data: Array<{
      id: string;
      created: number;
      owned_by: string;
    }>;
  };

  // Filter to only chat-compatible models
  const chatModelPrefixes = ["gpt-", "o1-", "o3-", "o4-"];
  const excludePatterns = ["-instruct", "-embedding", "-tts", "-whisper"];

  return data.data
    .filter((model) => {
      const id = model.id.toLowerCase();
      // Must start with a chat model prefix
      const hasValidPrefix = chatModelPrefixes.some((prefix) =>
        id.startsWith(prefix),
      );
      if (!hasValidPrefix) return false;

      // Must not contain excluded patterns
      const hasExcludedPattern = excludePatterns.some((pattern) =>
        id.includes(pattern),
      );
      return !hasExcludedPattern;
    })
    .map((model) => ({
      id: model.id,
      displayName: model.id, // OpenAI doesn't provide display names
      provider: "openai" as const,
      createdAt: new Date(model.created * 1000).toISOString(),
    }));
}

/**
 * Fetch models from MiniMax API (OpenAI-compatible)
 * Note: MiniMax might not expose /models endpoint, so we test the API key
 * with a simple chat completion and return hardcoded known models.
 */
async function fetchMiniMaxModels(apiKey: string): Promise<ModelInfo[]> {
  const baseUrl = config.chat.minimax.baseUrl;

  try {
    // First, try to fetch from /models endpoint
    try {
      const url = `${baseUrl}/models`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (response.ok) {
        const data = (await response.json()) as {
          data?: Array<{
            id: string;
            created?: number;
            owned_by?: string;
          }>;
        };

        if (data.data && Array.isArray(data.data)) {
          const filtered = data.data
            .filter((model) => {
              const id = model.id.toLowerCase();
              return id.startsWith("minimax-") || id.startsWith("abab");
            })
            .map((model) => ({
              id: model.id,
              displayName: model.id,
              provider: "minimax" as const,
              createdAt: model.created
                ? new Date(model.created * 1000).toISOString()
                : undefined,
            }));

          if (filtered.length > 0) {
            return filtered;
          }
        }
      }
    } catch (error) {
      logger.debug({ error, baseUrl }, "MiniMax /models endpoint not available");
    }

    // Fallback: Test with chat completion using multiple possible models
    const testModels = ["MiniMax-M2.1", "MiniMax-M2.1-lightning", "MiniMax-M2"];

    for (const testModel of testModels) {
      try {
        const testUrl = `${baseUrl}/chat/completions`;
        const testResponse = await fetch(testUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: testModel,
            messages: [{ role: "user", content: "test" }],
            max_tokens: 1,
          }),
        });

        if (testResponse.ok) {
          return [
            {
              id: "MiniMax-M2.1",
              displayName: "MiniMax-M2.1 (Programming/Reasoning)",
              provider: "minimax" as const,
            },
            {
              id: "MiniMax-M2.1-lightning",
              displayName: "MiniMax-M2.1-lightning (Fast)",
              provider: "minimax" as const,
            },
            {
              id: "MiniMax-M2",
              displayName: "MiniMax-M2 (Reasoning)",
              provider: "minimax" as const,
            },
          ];
        }

        const errorText = await testResponse.text();

        // If we get an "authorized_error" but it's 401, it's definitely an invalid key
        if (testResponse.status === 401) {
          throw new Error(`Invalid MiniMax API key: 401 ${errorText}`);
        }

        // If it's a "balance" error or "model" error (but not 401), the key is likely valid
        if (
          testResponse.status === 429 ||
          testResponse.status === 402 ||
          errorText.includes("balance") ||
          errorText.includes("insufficient") ||
          errorText.includes("model_not_found") ||
          errorText.includes("permission_denied")
        ) {
          logger.info({ testModel, status: testResponse.status }, "MiniMax API key validated (via fallback error check)");
          return [
            {
              id: "MiniMax-M2.1",
              displayName: "MiniMax-M2.1 (Programming/Reasoning)",
              provider: "minimax" as const,
            },
            {
              id: "MiniMax-M2.1-lightning",
              displayName: "MiniMax-M2.1-lightning (Fast)",
              provider: "minimax" as const,
            },
            {
              id: "MiniMax-M2",
              displayName: "MiniMax-M2 (Reasoning)",
              provider: "minimax" as const,
            },
          ];
        }
      } catch (error) {
        logger.debug({ error, testModel, baseUrl }, "MiniMax test completion failed");
        if (error instanceof Error && error.message.includes("401")) {
          throw error; // Re-throw 401 promptly
        }
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("401")) {
      throw error;
    }
    throw new Error(`Failed to connect to MiniMax API: ${(error as Error).message}`);
  }

  throw new Error("Failed to connect to MiniMax API after multiple attempts");
}

/**
 * Fetch models from Gemini API
 */
async function fetchGeminiModels(apiKey: string): Promise<ModelInfo[]> {
  const baseUrl = config.chat.gemini.baseUrl;
  const url = `${baseUrl}/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=100`;

  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(
      { status: response.status, error: errorText },
      "Failed to fetch Gemini models",
    );
    throw new Error(`Failed to fetch Gemini models: ${response.status}`);
  }

  const data = (await response.json()) as {
    models: Array<{
      name: string;
      displayName: string;
      supportedGenerationMethods?: string[];
    }>;
  };

  // Filter to only models that support generateContent (chat)
  return data.models
    .filter(
      (model) =>
        model.supportedGenerationMethods?.includes("generateContent") ?? false,
    )
    .map((model) => {
      // Model name is in format "models/gemini-1.5-flash-001", extract just the model ID
      const modelId = model.name.replace("models/", "");
      return {
        id: modelId,
        displayName: model.displayName,
        provider: "gemini" as const,
      };
    });
}

/**
 * Get API key for a provider using resolution priority: personal → team → org_wide → env
 */
async function getProviderApiKey({
  provider,
  organizationId,
  userId,
}: {
  provider: SupportedProvider;
  organizationId: string;
  userId: string;
}): Promise<string | null> {
  const apiKey = await ChatApiKeyModel.getCurrentApiKey({
    organizationId,
    userId,
    userTeamIds: await TeamModel.getUserTeamIds(userId),
    provider,
    // set null to autoresolve the api key
    conversationId: null,
  });

  if (apiKey?.secretId) {
    const secretValue = await getSecretValueForLlmProviderApiKey(
      apiKey.secretId,
    );

    if (secretValue) {
      return secretValue as string;
    }
  }

  // Fall back to environment variable
  switch (provider) {
    case "anthropic":
      return config.chat.anthropic.apiKey || null;
    case "openai":
      return config.chat.openai.apiKey || null;
    case "gemini":
      return config.chat.gemini.apiKey || null;
    case "minimax":
      return config.chat.minimax.apiKey || null;
    default:
      return null;
  }
}

// We need to make sure that every new provider we support has a model fetcher function
const modelFetchers: Record<
  SupportedProvider,
  (apiKey: string) => Promise<ModelInfo[]>
> = {
  anthropic: fetchAnthropicModels,
  openai: fetchOpenAiModels,
  gemini: fetchGeminiModels,
  minimax: fetchMiniMaxModels,
};

/**
 * Test if an API key is valid by attempting to fetch models from the provider.
 * Throws an error if the key is invalid or the provider is unreachable.
 */
export async function testProviderApiKey(
  provider: SupportedProvider,
  apiKey: string,
): Promise<void> {
  await modelFetchers[provider](apiKey);
}

/**
 * Fetch models for a single provider
 */
async function fetchModelsForProvider({
  provider,
  organizationId,
  userId,
}: {
  provider: SupportedProvider;
  organizationId: string;
  userId: string;
}): Promise<ModelInfo[]> {
  const apiKey = await getProviderApiKey({
    provider,
    organizationId,
    userId,
  });

  // For Gemini with Vertex AI, we might not have an API key
  if (!apiKey && !(provider === "gemini" && isVertexAiEnabled())) {
    logger.debug(
      { provider, organizationId },
      "No API key available for provider",
    );
    return [];
  }

  const cacheKey =
    `${CacheKey.GetChatModels}-${provider}-${organizationId}-${userId}-${apiKey?.slice(0, 6)}` as const;
  const cachedModels = await cacheManager.get<ModelInfo[]>(cacheKey);

  if (cachedModels) {
    return cachedModels;
  }

  try {
    let models: ModelInfo[] = [];
    if (["anthropic", "openai", "minimax"].includes(provider)) {
      if (apiKey) {
        models = await modelFetchers[provider](apiKey);
      }
    } else if (provider === "gemini") {
      if (!apiKey) {
        logger.debug(
          "Gemini Vertex AI mode enabled but no API key for model listing",
        );
      } else {
        models = await modelFetchers[provider](apiKey);
      }
    }
    await cacheManager.set(cacheKey, models, CHAT_MODELS_CACHE_TTL_MS);
    return models;
  } catch (error) {
    logger.error(
      { provider, organizationId, error },
      "Error fetching models from provider",
    );
    return [];
  }
}

const chatModelsRoutes: FastifyPluginAsyncZod = async (fastify) => {
  // Get available models from all configured providers
  fastify.get(
    "/api/chat/models",
    {
      schema: {
        operationId: RouteId.GetChatModels,
        description: `Get available LLM models from all configured providers. Models are fetched from provider APIs and cached for ${CHAT_MODELS_CACHE_TTL_HOURS} hours.`,
        tags: ["Chat"],
        querystring: z.object({
          provider: SupportedChatProviderSchema.optional(),
        }),
        response: constructResponseSchema(z.array(ChatModelSchema)),
      },
    },
    async ({ query, organizationId, user }, reply) => {
      const { provider } = query;
      const providersToFetch = provider ? [provider] : SupportedProviders;

      const results = await Promise.all(
        providersToFetch.map((p) =>
          fetchModelsForProvider({
            provider: p as SupportedProvider,
            organizationId,
            userId: user.id,
          }),
        ),
      );

      const models = results.flat();

      logger.info(
        { organizationId, provider, modelCount: models.length },
        "Fetched and cached chat models",
      );

      logger.debug(
        { organizationId, provider, totalModels: models.length },
        "Returning chat models",
      );

      return reply.send(models);
    },
  );
};

export default chatModelsRoutes;
