import type { UIMessage } from "@ai-sdk/react";
import type { ChatStatus, DynamicToolUIPart, ToolUIPart } from "ai";
import Image from "next/image";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Response } from "@/components/ai-elements/response";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { EditableMessage } from "@/components/chat/editable-message";
import { useDeleteMessagesAfter, useUpdateMessage } from "@/lib/chat.query";

interface ChatMessagesProps {
  messages: UIMessage[];
  hideToolCalls?: boolean;
  status: ChatStatus;
  conversationId?: string;
  onMessageEdit?: (messageId: string, newText: string) => void;
  sendMessage?: (message: {
    role: "user";
    parts: Array<{ type: "text"; text: string }>;
  }) => void;
  setMessages?: (messages: UIMessage[]) => void;
}

// Type guards for tool parts
// biome-ignore lint/suspicious/noExplicitAny: AI SDK message parts have dynamic structure
function isToolPart(part: any): part is {
  type: string;
  state?: string;
  toolCallId?: string;
  // biome-ignore lint/suspicious/noExplicitAny: Tool inputs are dynamic based on tool schema
  input?: any;
  // biome-ignore lint/suspicious/noExplicitAny: Tool outputs are dynamic based on tool execution
  output?: any;
  errorText?: string;
} {
  return (
    typeof part === "object" &&
    part !== null &&
    "type" in part &&
    (part.type?.startsWith("tool-") || part.type === "dynamic-tool")
  );
}

export function ChatMessages({
  messages,
  hideToolCalls = false,
  status,
  conversationId: _conversationId,
  onMessageEdit,
  sendMessage,
  setMessages,
}: ChatMessagesProps) {
  const isStreamingStalled = useStreamingStallDetection(messages, status);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const updateMessageMutation = useUpdateMessage();
  const deleteMessagesAfterMutation = useDeleteMessagesAfter();

  // Find the index of the message being edited
  const editingMessageIndex = useMemo(
    () =>
      editingMessageId
        ? messages.findIndex((m) => m.id === editingMessageId)
        : -1,
    [editingMessageId, messages],
  );

  const handleStartEdit = useCallback((messageId: string) => {
    setEditingMessageId(messageId);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
  }, []);

  const handleSaveEdit = useCallback(
    async (messageId: string, newText: string) => {
      const message = messages.find((m) => m.id === messageId);
      if (!message) return;

      // Update the message content
      const updatedContent = {
        ...message,
        parts: message.parts.map((part) =>
          part.type === "text" ? { ...part, text: newText } : part,
        ),
      };

      try {
        // Update message in database
        await updateMessageMutation.mutateAsync({
          id: messageId,
          content: updatedContent,
        });

        // If it's a user message, delete messages after and regenerate
        if (message.role === "user" && sendMessage && setMessages) {
          // Delete messages after this one
          await deleteMessagesAfterMutation.mutateAsync(messageId);

          // Update local state to only include messages up to and including the edited message
          // The key is to ensure the edited message is the last message in the state
          // before calling sendMessage, so sendMessage doesn't add a duplicate
          const messageIndex = messages.findIndex((m) => m.id === messageId);
          if (messageIndex >= 0) {
            const trimmedMessages = messages.slice(0, messageIndex + 1);
            // Update the edited message with the new text
            trimmedMessages[messageIndex] = {
              ...trimmedMessages[messageIndex],
              parts: trimmedMessages[messageIndex].parts.map((part) =>
                part.type === "text" ? { ...part, text: newText } : part,
              ),
            };

            // Update state with trimmed messages (edited message is now last)
            setMessages(trimmedMessages);

            // Use a Promise to ensure state update completes before sending
            // This prevents sendMessage from seeing stale state and creating a duplicate
            await new Promise<void>((resolve) => {
              // Use double requestAnimationFrame to ensure React has processed the state update
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  resolve();
                });
              });
            });

            // Now sendMessage will see the edited message as the last message
            // Since we've already updated it in the DB, the backend should handle it correctly
            // However, sendMessage will still add a new message, which may cause a duplicate
            // The proper fix would be in the backend to detect and skip duplicate messages
            sendMessage({
              role: "user",
              parts: [{ type: "text", text: newText }],
            });
          } else {
            // Fallback if message not found in array
            sendMessage({
              role: "user",
              parts: [{ type: "text", text: newText }],
            });
          }
        } else if (message.role === "user" && sendMessage) {
          // Fallback if setMessages not available - just send the message
          // This may cause duplicates but is better than nothing
          sendMessage({
            role: "user",
            parts: [{ type: "text", text: newText }],
          });
        } else if (onMessageEdit) {
          // For assistant messages, just call the callback
          onMessageEdit(messageId, newText);
        }

        setEditingMessageId(null);
      } catch (_error) {
        // Error handling is done by the mutation hooks with toast notifications
        // This catch block prevents unhandled promise rejections
      }
    },
    [
      messages,
      updateMessageMutation,
      deleteMessagesAfterMutation,
      sendMessage,
      onMessageEdit,
      setMessages,
    ],
  );

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex h-full items-center justify-center text-center text-muted-foreground">
        <p className="text-sm">Start a conversation by sending a message</p>
      </div>
    );
  }

  return (
    <Conversation className="h-full">
      <ConversationContent>
        <div className="max-w-4xl mx-auto">
          {messages.map((message, idx) => {
            // Hide messages below the one being edited (for user messages)
            const shouldHide =
              editingMessageId &&
              editingMessageIndex >= 0 &&
              idx > editingMessageIndex;

            if (shouldHide) {
              return null;
            }

            return (
              <div key={message.id || idx}>
                {message.parts.map((part, i) => {
                  // Skip tool result parts that immediately follow a tool invocation with same toolCallId
                  if (
                    isToolPart(part) &&
                    part.state === "output-available" &&
                    i > 0
                  ) {
                    const prevPart = message.parts[i - 1];
                    if (
                      isToolPart(prevPart) &&
                      prevPart.state === "input-available" &&
                      prevPart.toolCallId === part.toolCallId
                    ) {
                      return null;
                    }
                  }

                  // Hide tool calls if hideToolCalls is true
                  if (
                    hideToolCalls &&
                    isToolPart(part) &&
                    (part.type?.startsWith("tool-") ||
                      part.type === "dynamic-tool")
                  ) {
                    return null;
                  }

                  switch (part.type) {
                    case "text": {
                      const isEditing = editingMessageId === message.id;
                      // Only allow editing if message has an ID (saved to DB)
                      const canEdit = !!message.id;
                      return (
                        <Fragment key={`${message.id}-${i}`}>
                          {canEdit ? (
                            <EditableMessage
                              message={message}
                              messageIndex={idx}
                              isEditing={isEditing}
                              onStartEdit={() =>
                                message.id && handleStartEdit(message.id)
                              }
                              onCancelEdit={handleCancelEdit}
                              onSaveEdit={(text) =>
                                message.id && handleSaveEdit(message.id, text)
                              }
                              hideMessagesBelow={
                                isEditing && message.role === "user"
                              }
                            >
                              {message.role === "system" && (
                                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                  System Prompt
                                </div>
                              )}
                              <Response>{part.text}</Response>
                            </EditableMessage>
                          ) : (
                            <Message from={message.role}>
                              <MessageContent>
                                {message.role === "system" && (
                                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    System Prompt
                                  </div>
                                )}
                                <Response>{part.text}</Response>
                              </MessageContent>
                            </Message>
                          )}
                        </Fragment>
                      );
                    }

                    case "reasoning":
                      return (
                        <Reasoning
                          key={`${message.id}-${i}`}
                          className="w-full"
                        >
                          <ReasoningTrigger />
                          <ReasoningContent>{part.text}</ReasoningContent>
                        </Reasoning>
                      );

                    case "dynamic-tool": {
                      if (!isToolPart(part)) return null;
                      const toolName = part.toolName;

                      // Look ahead for tool result (same tool call ID)
                      let toolResultPart = null;
                      const nextPart = message.parts[i + 1];
                      if (
                        nextPart &&
                        isToolPart(nextPart) &&
                        nextPart.type === "dynamic-tool" &&
                        nextPart.state === "output-available" &&
                        nextPart.toolCallId === part.toolCallId
                      ) {
                        toolResultPart = nextPart;
                      }

                      return (
                        <MessageTool
                          part={part}
                          key={`${message.id}-${i}`}
                          toolResultPart={toolResultPart}
                          toolName={toolName}
                        />
                      );
                    }

                    default: {
                      // Handle tool invocations (type is "tool-{toolName}")
                      if (isToolPart(part) && part.type?.startsWith("tool-")) {
                        const toolName = part.type.replace("tool-", "");

                        // Look ahead for tool result (same tool call ID)
                        // biome-ignore lint/suspicious/noExplicitAny: Tool result structure varies by tool type
                        let toolResultPart: any = null;
                        const nextPart = message.parts[i + 1];
                        if (
                          nextPart &&
                          isToolPart(nextPart) &&
                          nextPart.type?.startsWith("tool-") &&
                          nextPart.state === "output-available" &&
                          nextPart.toolCallId === part.toolCallId
                        ) {
                          toolResultPart = nextPart;
                        }

                        return (
                          <MessageTool
                            part={part}
                            key={`${message.id}-${i}`}
                            toolResultPart={toolResultPart}
                            toolName={toolName}
                          />
                        );
                      }

                      // Skip step-start and other non-renderable parts
                      return null;
                    }
                  }
                })}
              </div>
            );
          })}
          {(status === "submitted" ||
            (status === "streaming" && isStreamingStalled)) && (
            <Message from="assistant">
              <Image
                src={"/logo.png"}
                alt="Loading logo"
                width={40}
                height={40}
                className="object-contain h-8 w-auto animate-[bounce_700ms_ease_200ms_infinite]"
              />
            </Message>
          )}
        </div>
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}

// Custom hook to detect when streaming has stalled (>500ms without updates)
function useStreamingStallDetection(
  messages: UIMessage[],
  status: ChatStatus,
): boolean {
  const lastUpdateTimeRef = useRef<number>(Date.now());
  const [isStreamingStalled, setIsStreamingStalled] = useState(false);

  // Update last update time when messages change
  // biome-ignore lint/correctness/useExhaustiveDependencies: we need to react to messages change here
  useEffect(() => {
    if (status === "streaming") {
      lastUpdateTimeRef.current = Date.now();
      setIsStreamingStalled(false);
    }
  }, [messages, status]);

  // Check periodically if streaming has stalled
  useEffect(() => {
    if (status !== "streaming") {
      setIsStreamingStalled(false);
      return;
    }

    const interval = setInterval(() => {
      const timeSinceLastUpdate = Date.now() - lastUpdateTimeRef.current;
      if (timeSinceLastUpdate > 1_000) {
        setIsStreamingStalled(true);
      } else {
        setIsStreamingStalled(false);
      }
    }, 100); // Check every 100ms

    return () => clearInterval(interval);
  }, [status]);

  return isStreamingStalled;
}

function MessageTool({
  part,
  toolResultPart,
  toolName,
}: {
  part: ToolUIPart | DynamicToolUIPart;
  toolResultPart: ToolUIPart | DynamicToolUIPart | null;
  toolName: string;
}) {
  const outputError = toolResultPart
    ? tryToExtractErrorFromOutput(toolResultPart.output)
    : tryToExtractErrorFromOutput(part.output);
  const errorText = toolResultPart
    ? (toolResultPart.errorText ?? outputError)
    : (part.errorText ?? outputError);

  const hasInput = part.input && Object.keys(part.input).length > 0;
  const hasContent = Boolean(
    hasInput ||
      (toolResultPart && Boolean(toolResultPart.output)) ||
      (!toolResultPart && Boolean(part.output)),
  );

  return (
    <Tool className={hasContent ? "cursor-pointer" : ""}>
      <ToolHeader
        type={`tool-${toolName}`}
        state={getHeaderState({
          state: part.state || "input-available",
          toolResultPart,
          errorText,
        })}
        errorText={errorText}
        isCollapsible={hasContent}
      />
      <ToolContent>
        {hasInput ? <ToolInput input={part.input} /> : null}
        {toolResultPart && (
          <ToolOutput
            label={errorText ? "Error" : "Result"}
            output={toolResultPart.output}
            errorText={errorText}
          />
        )}
        {!toolResultPart && Boolean(part.output) && (
          <ToolOutput
            label={errorText ? "Error" : "Result"}
            output={part.output}
            errorText={errorText}
          />
        )}
      </ToolContent>
    </Tool>
  );
}

const tryToExtractErrorFromOutput = (output: unknown) => {
  try {
    if (typeof output !== "string") return undefined;
    const json = JSON.parse(output);
    return typeof json.error === "string" ? json.error : undefined;
  } catch (_error) {
    return undefined;
  }
};
const getHeaderState = ({
  state,
  toolResultPart,
  errorText,
}: {
  state: ToolUIPart["state"] | DynamicToolUIPart["state"];
  toolResultPart: ToolUIPart | DynamicToolUIPart | null;
  errorText: string | undefined;
}) => {
  if (errorText) return "output-error";
  if (toolResultPart) return "output-available";
  return state;
};
