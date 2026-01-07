/**
 * @deprecated LEGACY V1 ROUTE - LLM Proxy v2 is now the default
 *
 * This is a placeholder for the legacy v1 MiniMax proxy route handler.
 *
 * The new unified LLM proxy handler (./llm-proxy-handler.ts) is now the default.
 * V2 routes are located at: ./routesv2/minimax.ts
 *
 * This file should be removed after full migration to v2 routes.
 */
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import minimaxProxyRoutesV2 from "./routesv2/minimax";

// V1 route just delegates to V2 implementation
const minimaxProxyRoutesV1: FastifyPluginAsyncZod = async (fastify) => {
  await fastify.register(minimaxProxyRoutesV2);
};

export default minimaxProxyRoutesV1;

