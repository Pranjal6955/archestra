import { and, eq, gt } from "drizzle-orm";
import db, { schema } from "@/database";
import type { InsertMessage, Message, UpdateMessage } from "@/types";

class MessageModel {
  static async create(data: InsertMessage): Promise<Message> {
    const [message] = await db
      .insert(schema.messagesTable)
      .values(data)
      .returning();

    return message;
  }

  static async bulkCreate(messages: InsertMessage[]): Promise<void> {
    if (messages.length === 0) {
      return;
    }

    await db.insert(schema.messagesTable).values(messages);
  }

  static async findByConversation(conversationId: string): Promise<Message[]> {
    const messages = await db
      .select()
      .from(schema.messagesTable)
      .where(eq(schema.messagesTable.conversationId, conversationId))
      .orderBy(schema.messagesTable.createdAt);

    return messages;
  }

  static async findById(id: string): Promise<Message | null> {
    const [message] = await db
      .select()
      .from(schema.messagesTable)
      .where(eq(schema.messagesTable.id, id))
      .limit(1);

    return message || null;
  }

  static async update(id: string, data: UpdateMessage): Promise<Message | null> {
    const [updated] = await db
      .update(schema.messagesTable)
      .set(data)
      .where(eq(schema.messagesTable.id, id))
      .returning();

    return updated || null;
  }

  static async delete(id: string): Promise<void> {
    await db
      .delete(schema.messagesTable)
      .where(eq(schema.messagesTable.id, id));
  }

  static async deleteByConversation(conversationId: string): Promise<void> {
    await db
      .delete(schema.messagesTable)
      .where(eq(schema.messagesTable.conversationId, conversationId));
  }

  static async deleteAfter(
    conversationId: string,
    messageId: string,
  ): Promise<void> {
    // First, get the message to find its createdAt timestamp
    const message = await this.findById(messageId);
    if (!message) {
      return;
    }

    // Delete all messages in the conversation created after this message
    await db
      .delete(schema.messagesTable)
      .where(
        and(
          eq(schema.messagesTable.conversationId, conversationId),
          gt(schema.messagesTable.createdAt, message.createdAt),
        ),
      );
  }
}

export default MessageModel;
