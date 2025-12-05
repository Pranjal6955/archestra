import { describe, expect, test } from "@/test";
import db, { schema } from "@/database";
import MessageModel from "./message";

describe("MessageModel", () => {
  test("can create a message", async ({ makeConversation }) => {
    const conversation = await makeConversation("agent-123");

    const message = await MessageModel.create({
      conversationId: conversation.id,
      role: "user",
      content: {
        id: "msg-123",
        role: "user",
        parts: [{ type: "text", text: "Hello, world!" }],
      },
    });

    expect(message).toBeDefined();
    expect(message.id).toBeDefined();
    expect(message.conversationId).toBe(conversation.id);
    expect(message.role).toBe("user");
    expect(message.content).toBeDefined();
    expect(message.content.id).toBe("msg-123");
    expect(message.content.role).toBe("user");
    expect(message.createdAt).toBeDefined();
  });

  test("can create multiple messages with bulkCreate", async ({
    makeConversation,
  }) => {
    const conversation = await makeConversation("agent-123");

    const messages = [
      {
        conversationId: conversation.id,
        role: "user",
        content: {
          id: "msg-1",
          role: "user",
          parts: [{ type: "text", text: "First message" }],
        },
      },
      {
        conversationId: conversation.id,
        role: "assistant",
        content: {
          id: "msg-2",
          role: "assistant",
          parts: [{ type: "text", text: "Response to first" }],
        },
      },
      {
        conversationId: conversation.id,
        role: "user",
        content: {
          id: "msg-3",
          role: "user",
          parts: [{ type: "text", text: "Second message" }],
        },
      },
    ];

    await MessageModel.bulkCreate(messages);

    const foundMessages = await MessageModel.findByConversation(
      conversation.id,
    );
    expect(foundMessages).toHaveLength(3);
    expect(foundMessages[0].role).toBe("user");
    expect(foundMessages[1].role).toBe("assistant");
    expect(foundMessages[2].role).toBe("user");
  });

  test("bulkCreate handles empty array", async () => {
    // Should not throw
    await MessageModel.bulkCreate([]);
  });

  test("can find messages by conversation", async ({ makeConversation }) => {
    const conversation1 = await makeConversation("agent-123");
    const conversation2 = await makeConversation("agent-456");

    // Create messages for conversation1
    await MessageModel.bulkCreate([
      {
        conversationId: conversation1.id,
        role: "user",
        content: {
          id: "msg-1",
          role: "user",
          parts: [{ type: "text", text: "Message 1" }],
        },
      },
      {
        conversationId: conversation1.id,
        role: "assistant",
        content: {
          id: "msg-2",
          role: "assistant",
          parts: [{ type: "text", text: "Response 1" }],
        },
      },
    ]);

    // Create messages for conversation2
    await MessageModel.bulkCreate([
      {
        conversationId: conversation2.id,
        role: "user",
        content: {
          id: "msg-3",
          role: "user",
          parts: [{ type: "text", text: "Message 2" }],
        },
      },
    ]);

    const conversation1Messages = await MessageModel.findByConversation(
      conversation1.id,
    );
    expect(conversation1Messages).toHaveLength(2);
    expect(conversation1Messages[0].role).toBe("user");
    expect(conversation1Messages[1].role).toBe("assistant");

    const conversation2Messages = await MessageModel.findByConversation(
      conversation2.id,
    );
    expect(conversation2Messages).toHaveLength(1);
    expect(conversation2Messages[0].role).toBe("user");
  });

  test("findByConversation returns messages ordered by createdAt", async ({
    makeConversation,
  }) => {
    const conversation = await makeConversation("agent-123");

    // Create messages with slight delays to ensure different timestamps
    const message1 = await MessageModel.create({
      conversationId: conversation.id,
      role: "user",
      content: {
        id: "msg-1",
        role: "user",
        parts: [{ type: "text", text: "First" }],
      },
    });

    // Small delay to ensure different createdAt times
    await new Promise((resolve) => setTimeout(resolve, 10));

    const message2 = await MessageModel.create({
      conversationId: conversation.id,
      role: "assistant",
      content: {
        id: "msg-2",
        role: "assistant",
        parts: [{ type: "text", text: "Second" }],
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    const message3 = await MessageModel.create({
      conversationId: conversation.id,
      role: "user",
      content: {
        id: "msg-3",
        role: "user",
        parts: [{ type: "text", text: "Third" }],
      },
    });

    const messages = await MessageModel.findByConversation(conversation.id);

    expect(messages).toHaveLength(3);
    expect(messages[0].id).toBe(message1.id);
    expect(messages[1].id).toBe(message2.id);
    expect(messages[2].id).toBe(message3.id);
    expect(messages[0].createdAt.getTime()).toBeLessThanOrEqual(
      messages[1].createdAt.getTime(),
    );
    expect(messages[1].createdAt.getTime()).toBeLessThanOrEqual(
      messages[2].createdAt.getTime(),
    );
  });

  test("findByConversation returns empty array when no messages exist", async ({
    makeConversation,
  }) => {
    const conversation = await makeConversation("agent-123");

    const messages = await MessageModel.findByConversation(conversation.id);

    expect(messages).toBeDefined();
    expect(Array.isArray(messages)).toBe(true);
    expect(messages).toHaveLength(0);
  });

  test("can find message by id", async ({ makeConversation }) => {
    const conversation = await makeConversation("agent-123");

    const created = await MessageModel.create({
      conversationId: conversation.id,
      role: "user",
      content: {
        id: "msg-123",
        role: "user",
        parts: [{ type: "text", text: "Find me!" }],
      },
    });

    const found = await MessageModel.findById(created.id);

    expect(found).toBeDefined();
    expect(found?.id).toBe(created.id);
    expect(found?.conversationId).toBe(conversation.id);
    expect(found?.role).toBe("user");
    expect(found?.content.id).toBe("msg-123");
  });

  test("findById returns null when message not found", async () => {
    const found = await MessageModel.findById(
      "550e8400-e29b-41d4-a716-446655440000",
    );

    expect(found).toBeNull();
  });

  test("can update a message", async ({ makeConversation }) => {
    const conversation = await makeConversation("agent-123");

    const created = await MessageModel.create({
      conversationId: conversation.id,
      role: "user",
      content: {
        id: "msg-123",
        role: "user",
        parts: [{ type: "text", text: "Original text" }],
      },
    });

    const updatedContent = {
      id: "msg-123",
      role: "user",
      parts: [{ type: "text", text: "Updated text" }],
    };

    const updated = await MessageModel.update(created.id, {
      content: updatedContent,
    });

    expect(updated).toBeDefined();
    expect(updated?.id).toBe(created.id);
    expect(updated?.content.parts[0].text).toBe("Updated text");
    expect(updated?.conversationId).toBe(conversation.id);
    expect(updated?.role).toBe("user");

    // Verify the update persisted
    const found = await MessageModel.findById(created.id);
    expect(found?.content.parts[0].text).toBe("Updated text");
  });

  test("update returns null when message not found", async () => {
    const result = await MessageModel.update(
      "550e8400-e29b-41d4-a716-446655440000",
      {
        content: {
          id: "msg-123",
          role: "user",
          parts: [{ type: "text", text: "Updated" }],
        },
      },
    );

    expect(result).toBeNull();
  });

  test("can delete a message", async ({ makeConversation }) => {
    const conversation = await makeConversation("agent-123");

    const created = await MessageModel.create({
      conversationId: conversation.id,
      role: "user",
      content: {
        id: "msg-123",
        role: "user",
        parts: [{ type: "text", text: "To be deleted" }],
      },
    });

    await MessageModel.delete(created.id);

    const found = await MessageModel.findById(created.id);
    expect(found).toBeNull();
  });

  test("can delete all messages by conversation", async ({
    makeConversation,
  }) => {
    const conversation1 = await makeConversation("agent-123");
    const conversation2 = await makeConversation("agent-456");

    // Create messages for conversation1
    await MessageModel.bulkCreate([
      {
        conversationId: conversation1.id,
        role: "user",
        content: {
          id: "msg-1",
          role: "user",
          parts: [{ type: "text", text: "Message 1" }],
        },
      },
      {
        conversationId: conversation1.id,
        role: "assistant",
        content: {
          id: "msg-2",
          role: "assistant",
          parts: [{ type: "text", text: "Response 1" }],
        },
      },
    ]);

    // Create messages for conversation2
    await MessageModel.bulkCreate([
      {
        conversationId: conversation2.id,
        role: "user",
        content: {
          id: "msg-3",
          role: "user",
          parts: [{ type: "text", text: "Message 2" }],
        },
      },
    ]);

    // Delete all messages in conversation1
    await MessageModel.deleteByConversation(conversation1.id);

    // Verify conversation1 messages are deleted
    const conversation1Messages = await MessageModel.findByConversation(
      conversation1.id,
    );
    expect(conversation1Messages).toHaveLength(0);

    // Verify conversation2 messages are still there
    const conversation2Messages = await MessageModel.findByConversation(
      conversation2.id,
    );
    expect(conversation2Messages).toHaveLength(1);
  });

  test("deleteByConversation handles conversation with no messages", async ({
    makeConversation,
  }) => {
    const conversation = await makeConversation("agent-123");

    // Should not throw
    await MessageModel.deleteByConversation(conversation.id);

    const messages = await MessageModel.findByConversation(conversation.id);
    expect(messages).toHaveLength(0);
  });

  test("can delete messages after a specific message", async ({
    makeConversation,
  }) => {
    const conversation = await makeConversation("agent-123");

    // Create messages with slight delays to ensure different timestamps
    const message1 = await MessageModel.create({
      conversationId: conversation.id,
      role: "user",
      content: {
        id: "msg-1",
        role: "user",
        parts: [{ type: "text", text: "First" }],
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    const message2 = await MessageModel.create({
      conversationId: conversation.id,
      role: "assistant",
      content: {
        id: "msg-2",
        role: "assistant",
        parts: [{ type: "text", text: "Second" }],
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    const message3 = await MessageModel.create({
      conversationId: conversation.id,
      role: "user",
      content: {
        id: "msg-3",
        role: "user",
        parts: [{ type: "text", text: "Third" }],
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    const message4 = await MessageModel.create({
      conversationId: conversation.id,
      role: "assistant",
      content: {
        id: "msg-4",
        role: "assistant",
        parts: [{ type: "text", text: "Fourth" }],
      },
    });

    // Delete messages after message2
    await MessageModel.deleteAfter(conversation.id, message2.id);

    const remainingMessages = await MessageModel.findByConversation(
      conversation.id,
    );

    // Should only have message1 and message2
    expect(remainingMessages).toHaveLength(2);
    expect(remainingMessages[0].id).toBe(message1.id);
    expect(remainingMessages[1].id).toBe(message2.id);
  });

  test("deleteAfter handles non-existent message id", async ({
    makeConversation,
  }) => {
    const conversation = await makeConversation("agent-123");

    const message = await MessageModel.create({
      conversationId: conversation.id,
      role: "user",
      content: {
        id: "msg-1",
        role: "user",
        parts: [{ type: "text", text: "First" }],
      },
    });

    // Should not throw and should not delete anything
    await MessageModel.deleteAfter(
      conversation.id,
      "550e8400-e29b-41d4-a716-446655440000",
    );

    const messages = await MessageModel.findByConversation(conversation.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe(message.id);
  });

  test("deleteAfter handles message from different conversation", async ({
    makeConversation,
  }) => {
    const conversation1 = await makeConversation("agent-123");
    const conversation2 = await makeConversation("agent-456");

    const message1 = await MessageModel.create({
      conversationId: conversation1.id,
      role: "user",
      content: {
        id: "msg-1",
        role: "user",
        parts: [{ type: "text", text: "Message 1" }],
      },
    });

    const message2 = await MessageModel.create({
      conversationId: conversation2.id,
      role: "user",
      content: {
        id: "msg-2",
        role: "user",
        parts: [{ type: "text", text: "Message 2" }],
      },
    });

    // Try to delete messages in conversation1 after message2 (from conversation2)
    // Should not delete anything since message2 is from a different conversation
    await MessageModel.deleteAfter(conversation1.id, message2.id);

    const conversation1Messages = await MessageModel.findByConversation(
      conversation1.id,
    );
    expect(conversation1Messages).toHaveLength(1);
    expect(conversation1Messages[0].id).toBe(message1.id);

    const conversation2Messages = await MessageModel.findByConversation(
      conversation2.id,
    );
    expect(conversation2Messages).toHaveLength(1);
    expect(conversation2Messages[0].id).toBe(message2.id);
  });

  test("deleteAfter deletes messages created at the same time as reference message", async ({
    makeConversation,
  }) => {
    const conversation = await makeConversation("agent-123");

    const timestamp = new Date();

    // Create messages manually with same timestamp
    const [message1] = await db
      .insert(schema.messagesTable)
      .values({
        conversationId: conversation.id,
        role: "user",
        content: {
          id: "msg-1",
          role: "user",
          parts: [{ type: "text", text: "First" }],
        },
        createdAt: timestamp,
      })
      .returning();

    const [message2] = await db
      .insert(schema.messagesTable)
      .values({
        conversationId: conversation.id,
        role: "assistant",
        content: {
          id: "msg-2",
          role: "assistant",
          parts: [{ type: "text", text: "Second" }],
        },
        createdAt: timestamp, // Same timestamp
      })
      .returning();

    await new Promise((resolve) => setTimeout(resolve, 10));

    const message3 = await MessageModel.create({
      conversationId: conversation.id,
      role: "user",
      content: {
        id: "msg-3",
        role: "user",
        parts: [{ type: "text", text: "Third" }],
      },
    });

    // Delete messages after message2 (which has same timestamp as message1)
    // Should only delete message3 (created after)
    await MessageModel.deleteAfter(conversation.id, message2.id);

    const remainingMessages = await MessageModel.findByConversation(
      conversation.id,
    );

    // Should have message1 and message2 (same timestamp, so message1 is not deleted)
    expect(remainingMessages).toHaveLength(2);
    expect(remainingMessages.some((m) => m.id === message1.id)).toBe(true);
    expect(remainingMessages.some((m) => m.id === message2.id)).toBe(true);
  });
});

