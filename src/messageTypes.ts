/**
 * CLI-specific message types
 * These types are only used by the CLI for handling user and agent messages
 */

import { z } from 'zod';
import { MessageMetaSchema } from '@happy-engineering/happy-api-client';

export const UserMessageSchema = z.object({
    role: z.literal('user'),
    content: z.object({
        type: z.literal('text'),
        text: z.string()
    }),
    localKey: z.string().optional(),
    meta: MessageMetaSchema.optional()
});

export type UserMessage = z.infer<typeof UserMessageSchema>;

export const AgentMessageSchema = z.object({
    role: z.literal('agent'),
    content: z.object({
        type: z.literal('output'),
        data: z.any()
    }),
    meta: MessageMetaSchema.optional()
});

export type AgentMessage = z.infer<typeof AgentMessageSchema>;

export const MessageContentSchema = z.union([UserMessageSchema, AgentMessageSchema]);

export type MessageContent = z.infer<typeof MessageContentSchema>;