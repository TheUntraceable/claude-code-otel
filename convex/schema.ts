import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
    claudeEvents: defineTable({
        receivedAtMs: v.number(),
        dedupeKey: v.string(),
        eventName: v.string(),
        sessionId: v.optional(v.string()),
        promptId: v.optional(v.string()),
        eventTimestamp: v.optional(v.string()),
        eventSequence: v.optional(v.number()),
        model: v.optional(v.string()),
        inputTokens: v.optional(v.number()),
        outputTokens: v.optional(v.number()),
        cacheReadTokens: v.optional(v.number()),
        cacheCreationTokens: v.optional(v.number()),
        costUsd: v.optional(v.number()),
        promptLength: v.optional(v.number()),
        prompt: v.optional(v.string()),
        toolName: v.optional(v.string()),
        success: v.optional(v.boolean()),
        durationMs: v.optional(v.number()),
        error: v.optional(v.string()),
        body: v.optional(v.string()),
        rawAttributes: v.optional(v.string()),
    })
        .index("by_dedupe_key", ["dedupeKey"])
        .index("by_event_name", ["eventName"])
        .index("by_session_id", ["sessionId"])
        .index("by_prompt_id", ["promptId"])
        .index("by_received_at", ["receivedAtMs"]),
});
