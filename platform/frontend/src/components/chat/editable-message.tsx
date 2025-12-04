"use client";

import type { UIMessage } from "@ai-sdk/react";
import { Pencil, X, Check } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EditableMessageProps {
  message: UIMessage;
  messageIndex: number;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (text: string) => void;
  hideMessagesBelow?: boolean;
  children: React.ReactNode;
}

export function EditableMessage({
  message,
  messageIndex,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  hideMessagesBelow,
  children,
}: EditableMessageProps) {
  const [editText, setEditText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Extract text from message parts
  useEffect(() => {
    if (isEditing && message.parts) {
      const textPart = message.parts.find((part) => part.type === "text");
      const text = textPart && "text" in textPart ? textPart.text : "";
      setEditText(text);
    }
  }, [isEditing, message.parts]);

  // Focus textarea when editing starts
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length,
      );
    }
  }, [isEditing]);

  const handleSave = () => {
    if (editText.trim()) {
      onSaveEdit(editText.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancelEdit();
    }
  };

  if (isEditing) {
    return (
      <Message from={message.role}>
        <MessageContent className="relative">
          <textarea
            ref={textareaRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={handleKeyDown}
            className={cn(
              "w-full resize-none bg-transparent outline-none",
              "min-h-[60px] max-h-[300px]",
              message.role === "user"
                ? "text-primary-foreground placeholder:text-primary-foreground/50"
                : "text-foreground placeholder:text-muted-foreground",
            )}
            placeholder="Type your message..."
            rows={3}
          />
          <div className="flex gap-2 mt-2 justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancelEdit}
              className="h-8"
            >
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSave}
              className="h-8"
              disabled={!editText.trim()}
            >
              <Check className="h-4 w-4 mr-1" />
              Save
            </Button>
          </div>
        </MessageContent>
      </Message>
    );
  }

  return (
    <Message from={message.role}>
      <MessageContent className="group relative">
        {children}
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "absolute opacity-0 group-hover:opacity-100 transition-opacity",
            "h-6 w-6 p-0",
            message.role === "user"
              ? "top-2 right-2 text-primary-foreground hover:text-primary-foreground hover:bg-primary/20"
              : "top-2 right-2 text-muted-foreground hover:text-foreground",
          )}
          onClick={onStartEdit}
          aria-label="Edit message"
        >
          <Pencil className="h-3 w-3" />
        </Button>
      </MessageContent>
    </Message>
  );
}

