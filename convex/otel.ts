import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { internalMutation, query } from "./_generated/server";

const normalizedEventValidator = v.object({
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
});

type ToolAggregate = {
    toolName: string;
    count: number;
    successCount: number;
    failureCount: number;
};

type ModelAggregate = {
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    costUsd: number;
    requestCount: number;
    avgDurationMs: number;
    totalDurationMs: number;
    durationSamples: number;
};

type SessionAggregate = {
    sessionId: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    apiRequestCount: number;
    promptCount: number;
    lastActivityMs: number;
};

type MessageAggregate = {
    id: string;
    sessionId: string;
    promptId: string | null;
    prompt: string | null;
    promptLength: number | null;
    inputTokens: number;
    outputTokens: number;
    model: string | null;
    requestCount: number;
    eventSequence: number | null;
    timestamp: string;
    timestampMs: number;
};

export const ingestNormalizedEvents = internalMutation({
    args: {
        events: v.array(normalizedEventValidator),
    },
    handler: async (ctx, args) => {
        let inserted = 0;
        let duplicate = 0;

        for (const event of args.events) {
            const existing = await ctx.db
                .query("claudeEvents")
                .withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", event.dedupeKey))
                .first();

            if (existing) {
                duplicate += 1;
                continue;
            }

            await ctx.db.insert("claudeEvents", event);
            inserted += 1;
        }

        return {
            inserted,
            duplicate,
            received: args.events.length,
        };
    },
});

export const getDashboardData = query({
    args: {
        messageLimit: v.optional(v.number()),
        sessionLimit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const messageLimit = clamp(args.messageLimit ?? 100, 1, 500);
        const sessionLimit = clamp(args.sessionLimit ?? 25, 1, 200);

        const apiRequests = await ctx.db
            .query("claudeEvents")
            .withIndex("by_event_name", (q) => q.eq("eventName", "claude_code.api_request"))
            .collect();
        const promptEvents = await ctx.db
            .query("claudeEvents")
            .withIndex("by_event_name", (q) => q.eq("eventName", "claude_code.user_prompt"))
            .collect();
        const tokenMetricEvents = await ctx.db
            .query("claudeEvents")
            .withIndex("by_event_name", (q) => q.eq("eventName", "metric.claude_code.token.usage"))
            .collect();
        const toolUseEvents = await ctx.db
            .query("claudeEvents")
            .withIndex("by_event_name", (q) => q.eq("eventName", "claude_code.tool_use"))
            .collect();
        const toolResultEvents = await ctx.db
            .query("claudeEvents")
            .withIndex("by_event_name", (q) => q.eq("eventName", "claude_code.tool_result"))
            .collect();
        // Also check api_request events that have a toolName (some Claude Code versions attach tool_name there)
        const apiRequestsWithTool = apiRequests.filter((e) => !!e.toolName);
        const toolEvents = toolUseEvents.length > 0
            ? toolUseEvents
            : toolResultEvents.length > 0
                ? toolResultEvents
                : apiRequestsWithTool;

        const hasApiRequestTokenData = apiRequests.some(
            (event) =>
                typeof event.inputTokens === "number" || typeof event.outputTokens === "number",
        );

        const totals: {
            inputTokens: number;
            outputTokens: number;
            source: "api_request_events" | "token_usage_metrics" | "none";
            apiRequestCount: number;
        } = {
            inputTokens: 0,
            outputTokens: 0,
            source: hasApiRequestTokenData
                ? "api_request_events"
                : tokenMetricEvents.length > 0
                    ? "token_usage_metrics"
                    : "none",
            apiRequestCount: apiRequests.length,
        };

        if (hasApiRequestTokenData) {
            for (const event of apiRequests) {
                totals.inputTokens += event.inputTokens ?? 0;
                totals.outputTokens += event.outputTokens ?? 0;
            }
        } else {
            for (const event of tokenMetricEvents) {
                totals.inputTokens += event.inputTokens ?? 0;
                totals.outputTokens += event.outputTokens ?? 0;
            }
        }

        const sessionMap = new Map<string, SessionAggregate>();

        for (const promptEvent of promptEvents) {
            const sessionId = normalizeSessionId(promptEvent.sessionId);
            const aggregate = ensureSessionAggregate(sessionMap, sessionId);

            aggregate.promptCount += 1;
            aggregate.lastActivityMs = Math.max(aggregate.lastActivityMs, promptEvent.receivedAtMs);
        }

        if (hasApiRequestTokenData) {
            for (const event of apiRequests) {
                const sessionId = normalizeSessionId(event.sessionId);
                const aggregate = ensureSessionAggregate(sessionMap, sessionId);

                aggregate.inputTokens += event.inputTokens ?? 0;
                aggregate.outputTokens += event.outputTokens ?? 0;
                aggregate.totalTokens += (event.inputTokens ?? 0) + (event.outputTokens ?? 0);
                aggregate.apiRequestCount += 1;
                aggregate.lastActivityMs = Math.max(aggregate.lastActivityMs, event.receivedAtMs);
            }
        } else {
            for (const event of tokenMetricEvents) {
                const sessionId = normalizeSessionId(event.sessionId);
                const aggregate = ensureSessionAggregate(sessionMap, sessionId);

                aggregate.inputTokens += event.inputTokens ?? 0;
                aggregate.outputTokens += event.outputTokens ?? 0;
                aggregate.totalTokens += (event.inputTokens ?? 0) + (event.outputTokens ?? 0);
                aggregate.lastActivityMs = Math.max(aggregate.lastActivityMs, event.receivedAtMs);
            }
        }

        const sessions = Array.from(sessionMap.values())
            .map((session) => ({
                sessionId: session.sessionId,
                inputTokens: session.inputTokens,
                outputTokens: session.outputTokens,
                totalTokens: session.totalTokens,
                apiRequestCount: session.apiRequestCount,
                promptCount: session.promptCount,
                lastActivity: new Date(session.lastActivityMs).toISOString(),
            }))
            .sort((a, b) => {
                if (b.totalTokens !== a.totalTokens) {
                    return b.totalTokens - a.totalTokens;
                }

                return Date.parse(b.lastActivity) - Date.parse(a.lastActivity);
            })
            .slice(0, sessionLimit);

        const messageMap = new Map<string, MessageAggregate>();

        for (const promptEvent of promptEvents) {
            const sessionId = normalizeSessionId(promptEvent.sessionId);
            const messageKey = buildMessageKey(promptEvent.promptId, sessionId, promptEvent._id.toString());

            messageMap.set(messageKey, {
                id: messageKey,
                sessionId,
                promptId: promptEvent.promptId ?? null,
                prompt: promptEvent.prompt ?? null,
                promptLength:
                    promptEvent.promptLength ??
                    (promptEvent.prompt ? promptEvent.prompt.length : null),
                inputTokens: 0,
                outputTokens: 0,
                model: null,
                requestCount: 0,
                eventSequence: promptEvent.eventSequence ?? null,
                timestamp: eventTimestamp(promptEvent),
                timestampMs: eventTimestampMs(promptEvent),
            });
        }

        for (const requestEvent of apiRequests) {
            const sessionId = normalizeSessionId(requestEvent.sessionId);
            const messageKey = buildMessageKey(
                requestEvent.promptId,
                sessionId,
                requestEvent._id.toString(),
            );

            const existing = messageMap.get(messageKey);

            if (existing) {
                existing.inputTokens += requestEvent.inputTokens ?? 0;
                existing.outputTokens += requestEvent.outputTokens ?? 0;
                existing.requestCount += 1;
                existing.model = requestEvent.model ?? existing.model;

                if (requestEvent.eventSequence !== undefined) {
                    existing.eventSequence = requestEvent.eventSequence;
                }

                const requestTimeMs = eventTimestampMs(requestEvent);
                if (requestTimeMs > existing.timestampMs) {
                    existing.timestampMs = requestTimeMs;
                    existing.timestamp = eventTimestamp(requestEvent);
                }

                continue;
            }

            messageMap.set(messageKey, {
                id: messageKey,
                sessionId,
                promptId: requestEvent.promptId ?? null,
                prompt: null,
                promptLength: null,
                inputTokens: requestEvent.inputTokens ?? 0,
                outputTokens: requestEvent.outputTokens ?? 0,
                model: requestEvent.model ?? null,
                requestCount: 1,
                eventSequence: requestEvent.eventSequence ?? null,
                timestamp: eventTimestamp(requestEvent),
                timestampMs: eventTimestampMs(requestEvent),
            });
        }

        const messages = Array.from(messageMap.values())
            .sort((a, b) => b.timestampMs - a.timestampMs)
            .slice(0, messageLimit)
            .map((message) => ({
                id: message.id,
                sessionId: message.sessionId,
                promptId: message.promptId,
                prompt: message.prompt,
                promptLength: message.promptLength,
                inputTokens: message.inputTokens,
                outputTokens: message.outputTokens,
                model: message.model,
                requestCount: message.requestCount,
                eventSequence: message.eventSequence,
                timestamp: message.timestamp,
            }));

        // Model breakdown
        const modelMap = new Map<string, ModelAggregate>();
        const tokenSource = hasApiRequestTokenData ? apiRequests : tokenMetricEvents;

        for (const event of tokenSource) {
            const model = event.model ?? "(unknown)";
            let agg = modelMap.get(model);
            if (!agg) {
                agg = {
                    model,
                    inputTokens: 0,
                    outputTokens: 0,
                    cacheReadTokens: 0,
                    cacheCreationTokens: 0,
                    costUsd: 0,
                    requestCount: 0,
                    avgDurationMs: 0,
                    totalDurationMs: 0,
                    durationSamples: 0,
                };
                modelMap.set(model, agg);
            }
            agg.inputTokens += event.inputTokens ?? 0;
            agg.outputTokens += event.outputTokens ?? 0;
            agg.cacheReadTokens += event.cacheReadTokens ?? 0;
            agg.cacheCreationTokens += event.cacheCreationTokens ?? 0;
            agg.costUsd += event.costUsd ?? 0;
            agg.requestCount += 1;
            if (typeof event.durationMs === "number") {
                agg.totalDurationMs += event.durationMs;
                agg.durationSamples += 1;
            }
        }

        const models = Array.from(modelMap.values())
            .map((m) => ({
                ...m,
                totalTokens: m.inputTokens + m.outputTokens,
                avgDurationMs: m.durationSamples > 0 ? Math.round(m.totalDurationMs / m.durationSamples) : 0,
            }))
            .sort((a, b) => b.totalTokens - a.totalTokens);

        // Extended totals
        let totalCacheReadTokens = 0;
        let totalCacheCreationTokens = 0;
        let totalCostUsd = 0;

        for (const event of tokenSource) {
            totalCacheReadTokens += event.cacheReadTokens ?? 0;
            totalCacheCreationTokens += event.cacheCreationTokens ?? 0;
            totalCostUsd += event.costUsd ?? 0;
        }

        // Tool usage breakdown
        const toolMap = new Map<string, ToolAggregate>();
        for (const event of toolEvents) {
            const name = event.toolName ?? "(unknown)";
            let agg = toolMap.get(name);
            if (!agg) {
                agg = { toolName: name, count: 0, successCount: 0, failureCount: 0 };
                toolMap.set(name, agg);
            }
            agg.count += 1;
            if (event.success === true) agg.successCount += 1;
            else if (event.success === false) agg.failureCount += 1;
        }

        const tools = Array.from(toolMap.values())
            .sort((a, b) => b.count - a.count)
            .map((t) => ({
                toolName: t.toolName,
                count: t.count,
                successCount: t.successCount,
                failureCount: t.failureCount,
                successRate: t.successCount + t.failureCount > 0
                    ? Math.round((t.successCount / (t.successCount + t.failureCount)) * 100)
                    : null,
            }));

        return {
            totals: {
                ...totals,
                cacheReadTokens: totalCacheReadTokens,
                cacheCreationTokens: totalCacheCreationTokens,
                costUsd: totalCostUsd,
            },
            sessions,
            messages,
            models,
            tools,
            counts: {
                apiRequests: apiRequests.length,
                promptEvents: promptEvents.length,
                tokenMetricEvents: tokenMetricEvents.length,
                toolEvents: toolEvents.length,
                toolUseEvents: toolUseEvents.length,
                toolResultEvents: toolResultEvents.length,
            },
        };
    },
});

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function normalizeSessionId(sessionId?: string) {
    return sessionId && sessionId.length > 0 ? sessionId : "(unknown session)";
}

function ensureSessionAggregate(
    sessionMap: Map<string, SessionAggregate>,
    sessionId: string,
) {
    let aggregate = sessionMap.get(sessionId);

    if (!aggregate) {
        aggregate = {
            sessionId,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            apiRequestCount: 0,
            promptCount: 0,
            lastActivityMs: 0,
        };

        sessionMap.set(sessionId, aggregate);
    }

    return aggregate;
}

function eventTimestamp(event: Doc<"claudeEvents">) {
    return event.eventTimestamp ?? new Date(event.receivedAtMs).toISOString();
}

function eventTimestampMs(event: Doc<"claudeEvents">) {
    if (event.eventTimestamp) {
        const parsed = Date.parse(event.eventTimestamp);

        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return event.receivedAtMs;
}

function buildMessageKey(promptId: string | undefined, sessionId: string, fallback: string) {
    if (!promptId) {
        return fallback;
    }

    return `${sessionId}::${promptId}`;
}
