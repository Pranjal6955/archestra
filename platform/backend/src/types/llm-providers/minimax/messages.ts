import { z } from "zod";

const FunctionToolCallSchema = z
  .object({
    id: z.string(),
    type: z.enum(["function"]),
    function: z
      .object({
        arguments: z.string(),
        name: z.string(),
      })
      .describe(`MiniMax OpenAI-compatible function tool call`),
  })
  .describe(`MiniMax OpenAI-compatible function tool call structure`);

const CustomToolCallSchema = z
  .object({
    id: z.string(),
    type: z.enum(["custom"]),
    custom: z
      .object({
        input: z.string(),
        name: z.string(),
      })
      .describe(`MiniMax OpenAI-compatible custom tool call`),
  })
  .describe(`MiniMax OpenAI-compatible custom tool call structure`);

export const ToolCallSchema = z
  .union([FunctionToolCallSchema, CustomToolCallSchema])
  .describe(`MiniMax OpenAI-compatible tool call structure`);

const ContentPartRefusalSchema = z
  .object({
    type: z.enum(["refusal"]),
    refusal: z.string(),
  })
  .describe(`MiniMax OpenAI-compatible refusal content part`);

const ContentPartTextSchema = z
  .object({
    type: z.enum(["text"]),
    text: z.string(),
  })
  .describe(`MiniMax OpenAI-compatible text content part`);

const ContentPartImageSchema = z
  .object({
    type: z.enum(["image_url"]),
    image_url: z
      .object({
        url: z.string(),
        detail: z.enum(["auto", "low", "high"]),
      })
      .describe(`MiniMax OpenAI-compatible image URL`),
  })
  .describe(`MiniMax OpenAI-compatible image content part`);

const ContentPartInputAudioSchema = z
  .object({
    type: z.enum(["input_audio"]),
    input_audio: z
      .object({
        data: z.string(),
        format: z.enum(["wav", "mp3"]),
      })
      .describe(`MiniMax OpenAI-compatible audio input`),
  })
  .describe(`MiniMax OpenAI-compatible audio content part`);

const ContentPartFileSchema = z
  .object({
    type: z.enum(["file"]),
    file: z
      .object({
        file_data: z.string().optional(),
        file_id: z.string().optional(),
        filename: z.string().optional(),
      })
      .describe(`MiniMax OpenAI-compatible file content part`),
  })
  .describe(`MiniMax OpenAI-compatible file content part`);

const ContentPartSchema = z
  .union([
    ContentPartTextSchema,
    ContentPartImageSchema,
    ContentPartInputAudioSchema,
    ContentPartFileSchema,
  ])
  .describe(`MiniMax OpenAI-compatible content part`);

const DeveloperMessageParamSchema = z
  .object({
    content: z.union([z.string(), z.array(ContentPartTextSchema)]),
    role: z.enum(["developer"]),
    name: z.string().optional(),
  })
  .describe(`MiniMax OpenAI-compatible developer message`);

const SystemMessageParamSchema = z
  .object({
    content: z.union([z.string(), z.array(ContentPartTextSchema)]),
    role: z.enum(["system"]),
    name: z.string().optional(),
  })
  .describe(`MiniMax OpenAI-compatible system message`);

const UserMessageParamSchema = z
  .object({
    content: z.union([z.string(), z.array(ContentPartSchema)]),
    role: z.enum(["user"]),
    name: z.string().optional(),
  })
  .describe(`MiniMax OpenAI-compatible user message`);

const AssistantMessageParamSchema = z
  .object({
    role: z.enum(["assistant"]),
    audio: z
      .object({
        id: z.string(),
      })
      .nullable()
      .optional(),
    content: z
      .union([
        z.string(),
        z.array(ContentPartTextSchema),
        z.array(ContentPartRefusalSchema),
      ])
      .nullable()
      .optional(),

    function_call: z
      .object({
        arguments: z.string(),
        name: z.string(),
      })
      .nullable()
      .optional(),
    name: z.string().optional(),
    refusal: z.string().nullable().optional(),
    tool_calls: z.array(ToolCallSchema).optional(),
  })
  .describe(`MiniMax OpenAI-compatible assistant message`);

const ToolMessageParamSchema = z
  .object({
    role: z.enum(["tool"]),
    content: z.union([z.string(), z.array(ContentPartTextSchema)]),
    tool_call_id: z.string(),
  })
  .describe(`MiniMax OpenAI-compatible tool message`);

const FunctionMessageParamSchema = z
  .object({
    role: z.enum(["function"]),
    content: z.string().nullable(),
    name: z.string(),
  })
  .describe(`MiniMax OpenAI-compatible function message`);

export const MessageParamSchema = z
  .union([
    DeveloperMessageParamSchema,
    SystemMessageParamSchema,
    UserMessageParamSchema,
    AssistantMessageParamSchema,
    ToolMessageParamSchema,
    FunctionMessageParamSchema,
  ])
  .describe(`MiniMax OpenAI-compatible message parameter`);

