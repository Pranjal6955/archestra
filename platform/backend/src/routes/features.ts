import { RouteId } from "@shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { getEmailProviderInfo } from "@/agents/incoming-email";
import config from "@/config";
import { McpServerRuntimeManager } from "@/mcp-server-runtime";
import { OrganizationModel } from "@/models";
import { isVertexAiEnabled } from "@/routes/proxy/utils/gemini-client";
import { getByosVaultKvVersion, isByosEnabled } from "@/secrets-manager";
import { EmailProviderTypeSchema, type GlobalToolPolicy } from "@/types";

const featuresRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    "/api/features",
    {
      schema: {
        operationId: RouteId.GetFeatures,
        description: "Get feature flags",
        tags: ["Features"],
        response: {
          200: z.strictObject({
            /**
             * NOTE: add feature flags here, example:
             * mcp_registry: z.boolean(),
             */
            "orchestrator-k8s-runtime": z.boolean(),
            /** BYOS (Bring Your Own Secrets) - allows teams to use external Vault folders */
            byosEnabled: z.boolean(),
            /** Vault KV version when BYOS is enabled (null if BYOS is disabled) */
            byosVaultKvVersion: z.enum(["1", "2"]).nullable(),
            /** Vertex AI Gemini mode - when enabled, no API key needed for Gemini */
            geminiVertexAiEnabled: z.boolean(),
            /** vLLM mode - when enabled, no API key may be needed */
            vllmEnabled: z.boolean(),
            /** Ollama mode - when enabled, no API key is typically needed */
            ollamaEnabled: z.boolean(),
            /** Global tool policy - permissive bypasses policy checks, restrictive enforces them */
            globalToolPolicy: z.enum(["permissive", "restrictive"]),
            /** Browser streaming - enables live browser automation via Playwright MCP */
            browserStreamingEnabled: z.boolean(),
            /** List of chat providers configured via environment variables */
            configuredEnvChatProviders: z.array(z.string()),
            /** Incoming email - allows agents to be invoked via email */
            incomingEmail: z.object({
              enabled: z.boolean(),
              provider: EmailProviderTypeSchema.optional(),
              displayName: z.string().optional(),
              emailDomain: z.string().optional(),
            }),
          }),
        },
      },
    },
    async (_request, reply) => {
      // Get global tool policy from first organization (fallback to permissive)
      const org = await OrganizationModel.getFirst();
      const globalToolPolicy: GlobalToolPolicy =
        org?.globalToolPolicy ?? "permissive";

      // Check which chat providers are configured via env vars
      const configuredEnvChatProviders = [
        config.chat.anthropic.apiKey ? "anthropic" : null,
        config.chat.openai.apiKey ? "openai" : null,
        config.chat.gemini.apiKey ? "gemini" : null,
        config.chat.cerebras.apiKey ? "cerebras" : null,
        config.chat.vllm.apiKey ? "vllm" : null,
        config.chat.ollama.apiKey ? "ollama" : null,
        config.chat.zhipuai.apiKey ? "zhipuai" : null,
      ].filter((p): p is string => p !== null);

      return reply.send({
        ...config.features,
        "orchestrator-k8s-runtime": McpServerRuntimeManager.isEnabled,
        byosEnabled: isByosEnabled(),
        byosVaultKvVersion: getByosVaultKvVersion(),
        geminiVertexAiEnabled: isVertexAiEnabled(),
        vllmEnabled: config.llm.vllm.enabled,
        ollamaEnabled: config.llm.ollama.enabled,
        globalToolPolicy,
        configuredEnvChatProviders,
        incomingEmail: getEmailProviderInfo(),
      });
    },
  );
};

export default featuresRoutes;
