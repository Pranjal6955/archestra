import type { UIMessage } from "@ai-sdk/react";
import { archestraApiSdk } from "@shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const {
  getChatConversations,
  getChatConversation,
  getChatAgentMcpTools,
  createChatConversation,
  updateChatConversation,
  deleteChatConversation,
  generateChatConversationTitle,
  updateChatMessage,
  deleteChatMessagesAfter,
} = archestraApiSdk as typeof archestraApiSdk & {
  updateChatMessage: (options: {
    path: { id: string };
    body: { content: UIMessage };
  }) => Promise<{ data: unknown; error: unknown }>;
  deleteChatMessagesAfter: (options: {
    path: { id: string };
  }) => Promise<{ data: unknown; error: unknown }>;
};

export function useConversation(conversationId?: string) {
  return useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: async () => {
      if (!conversationId) return null;
      const { data, error } = await getChatConversation({
        path: { id: conversationId },
      });
      if (error) throw new Error("Failed to fetch conversation");
      return data;
    },
    enabled: !!conversationId,
    staleTime: 0, // Always refetch to ensure we have the latest messages
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    refetchOnWindowFocus: false, // Don't refetch when window gains focus
    retry: false, // Don't retry on error to avoid multiple 404s
  });
}

export function useConversations() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      const { data, error } = await getChatConversations();
      if (error) throw new Error("Failed to fetch conversations");
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      agentId,
      promptId,
    }: {
      agentId: string;
      promptId?: string;
    }) => {
      const { data, error } = await createChatConversation({
        body: { agentId, promptId },
      });
      if (error) throw new Error("Failed to create conversation");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Conversation created successfully");
    },
    onError: () => {
      toast.error("Failed to create conversation");
    },
  });
}

export function useUpdateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      title,
    }: {
      id: string;
      title?: string | null;
    }) => {
      const { data, error } = await updateChatConversation({
        path: { id },
        body: { title },
      });
      if (error) throw new Error("Failed to update conversation");
      return data;
    },
    onSuccess: (
      _data: unknown,
      variables: { id: string; title?: string | null },
    ) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({
        queryKey: ["conversation", variables.id],
      });
      toast.success("Conversation updated successfully");
    },
    onError: () => {
      toast.error("Failed to update conversation");
    },
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await deleteChatConversation({
        path: { id },
      });
      if (error) throw new Error("Failed to delete conversation");
      return data;
    },
    onSuccess: (_data: unknown, deletedId: string) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.removeQueries({ queryKey: ["conversation", deletedId] });
      toast.success("Conversation deleted successfully");
    },
    onError: () => {
      toast.error("Failed to delete conversation");
    },
  });
}

export function useGenerateConversationTitle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      regenerate = false,
    }: {
      id: string;
      regenerate?: boolean;
    }) => {
      const { data, error } = await generateChatConversationTitle({
        path: { id },
        body: { regenerate },
      });
      if (error) throw new Error("Failed to generate conversation title");
      return data;
    },
    onSuccess: (
      _data: unknown,
      variables: { id: string; regenerate?: boolean },
    ) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({
        queryKey: ["conversation", variables.id],
      });
      toast.success("Conversation title generated successfully");
    },
    onError: () => {
      toast.error("Failed to generate conversation title");
    },
  });
}

export function useChatProfileMcpTools(agentId: string | undefined) {
  return useQuery({
    queryKey: ["chat", "agents", agentId, "mcp-tools"],
    queryFn: async () => {
      if (!agentId) return [];
      const { data, error } = await getChatAgentMcpTools({
        path: { agentId },
      });
      if (error) throw new Error("Failed to fetch MCP tools");
      return data;
    },
    enabled: !!agentId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,
  });
}

export function useUpdateMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, content }: { id: string; content: UIMessage }) => {
      const { data, error } = await updateChatMessage({
        path: { id },
        body: { content },
      });
      if (error) throw new Error("Failed to update message");
      return data;
    },
    onSuccess: () => {
      // Invalidate all conversation queries to refresh messages
      queryClient.invalidateQueries({ queryKey: ["conversation"] });
      toast.success("Message updated successfully");
    },
    onError: (error: Error) => {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to update message";
      toast.error(errorMessage);
    },
  });
}

export function useDeleteMessagesAfter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (messageId: string) => {
      const { data, error } = await deleteChatMessagesAfter({
        path: { id: messageId },
      });
      if (error) throw new Error("Failed to delete messages");
      return data;
    },
    onSuccess: () => {
      // Invalidate all conversation queries to refresh messages
      queryClient.invalidateQueries({ queryKey: ["conversation"] });
      toast.success("Messages deleted successfully");
    },
    onError: (error: Error) => {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to delete messages";
      toast.error(errorMessage);
    },
  });
}
