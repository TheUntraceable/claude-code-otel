import { httpRouter } from "convex/server";

import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

type NormalizedEvent = {
    receivedAtMs: number;
    dedupeKey: string;
    eventName: string;
    sessionId?: string;
    promptId?: string;
    eventTimestamp?: string;
    eventSequence?: number;
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
    costUsd?: number;
    promptLength?: number;
    prompt?: string;
    toolName?: string;
    success?: boolean;
    durationMs?: number;
    error?: string;
    body?: string;
    rawAttributes?: string;
};

const http = httpRouter();

const otelWebhookHandler = httpAction(async (ctx, request) => {
    const expectedToken = process.env.OTEL_INGEST_TOKEN;
    if (!expectedToken) {
        console.log(
            "OTEL_INGEST_TOKEN environment variable is not set. Please set it to a secure, random value and include it as a Bearer token in the Authorization header of your OTLP requests."
        )
        return Response.json(
            { error: "Server misconfiguration: OTEL_INGEST_TOKEN is not set." },
            { status: 500 },
        );
    }

    const authHeader = request.headers.get("otel_ingest_token");
    console.log(request.headers)
    const provided = authHeader?.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length)
        : authHeader;
    if (!provided || provided !== expectedToken) {
        console.log(provided, expectedToken)
        console.log(
            "Unauthorized request to OTLP ingest endpoint. Ensure that you are including the correct Bearer token in the Authorization header of your requests."
        )
        return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    const nowMs = Date.now();

    let payload: unknown;
    try {
        payload = await request.json();
    } catch {
        console.log(
            "Failed to parse request body as JSON. Ensure that you are sending a valid OTLP JSON payload and that the Content-Type header is set to application/json."
        )
        return Response.json(
            {
                error: "Request body must be JSON.",
            },
            { status: 400 },
        );
    }

    const normalizedEvents = normalizeOtelPayload(payload, nowMs);

    if (normalizedEvents.length === 0) {
        return Response.json(
            {
                received: 0,
                inserted: 0,
                duplicate: 0,
                warning:
                    "No OTLP logs or metrics records were found. Send OTLP JSON payloads to this endpoint.",
            },
            { status: 202 },
        );
    }

    let inserted = 0;
    let duplicate = 0;

    for (const chunk of chunkArray(normalizedEvents, 100)) {
        const chunkResult = await ctx.runMutation(internal.otel.ingestNormalizedEvents, {
            events: chunk,
        });

        inserted += chunkResult.inserted;
        duplicate += chunkResult.duplicate;
    }

    return Response.json({
        received: normalizedEvents.length,
        inserted,
        duplicate,
    });
});

http.route({
    path: "/otel/webhook",
    method: "POST",
    handler: otelWebhookHandler,
});

http.route({
    path: "/v1/logs",
    method: "POST",
    handler: otelWebhookHandler,
});

http.route({
    path: "/v1/metrics",
    method: "POST",
    handler: otelWebhookHandler,
});

export default http;

function normalizeOtelPayload(payload: unknown, receivedAtMs: number) {
    const events: NormalizedEvent[] = [];
    const payloadObject = asObject(payload);

    if (!payloadObject) {
        return events;
    }

    const resourceLogs = asArray(payloadObject.resourceLogs);
    for (const resourceLog of resourceLogs) {
        events.push(...normalizeResourceLogs(resourceLog, receivedAtMs));
    }

    const resourceMetrics = asArray(payloadObject.resourceMetrics);
    for (const resourceMetric of resourceMetrics) {
        events.push(...normalizeResourceMetrics(resourceMetric, receivedAtMs));
    }

    return events;
}

function normalizeResourceLogs(resourceLog: unknown, receivedAtMs: number) {
    const events: NormalizedEvent[] = [];
    const resourceLogObject = asObject(resourceLog);

    if (!resourceLogObject) {
        return events;
    }

    const resourceAttributes = parseAttributes(
        asObject(resourceLogObject.resource)?.attributes,
    );
    const scopeLogs = extractScopeLogs(resourceLogObject);

    for (const scopeLog of scopeLogs) {
        const scopeLogObject = asObject(scopeLog);
        if (!scopeLogObject) {
            continue;
        }

        const logRecords = asArray(scopeLogObject.logRecords);
        for (const logRecord of logRecords) {
            const logRecordObject = asObject(logRecord);
            if (!logRecordObject) {
                continue;
            }

            const recordAttributes = parseAttributes(logRecordObject.attributes);
            const attributes = {
                ...resourceAttributes,
                ...recordAttributes,
            };

            const bodyValue = parseAnyValue(logRecordObject.body);
            const bodyString = toStringValue(bodyValue);
            const eventName = normalizeEventName(attributes["event.name"], bodyString);

            const timestampFromRecord =
                toIsoTimestampFromUnixNano(logRecordObject.timeUnixNano) ??
                toIsoTimestampFromUnixNano(logRecordObject.observedTimeUnixNano);
            const timestampFromAttributes = toStringValue(attributes["event.timestamp"]);
            const eventTimestamp = timestampFromAttributes ?? timestampFromRecord;

            const sessionId = toStringValue(attributes["session.id"]);
            const promptId = toStringValue(attributes["prompt.id"]);
            const eventSequence = toNumber(attributes["event.sequence"]);

            const normalizedEvent: NormalizedEvent = {
                receivedAtMs,
                dedupeKey: buildLogDedupeKey({
                    eventName,
                    sessionId,
                    promptId,
                    eventSequence,
                    eventTimestamp,
                    body: bodyString,
                    attributes,
                }),
                eventName,
                sessionId,
                promptId,
                eventTimestamp,
                eventSequence,
                model: toStringValue(attributes.model),
                inputTokens: toNumber(attributes.input_tokens),
                outputTokens: toNumber(attributes.output_tokens),
                cacheReadTokens: toNumber(attributes.cache_read_tokens),
                cacheCreationTokens: toNumber(attributes.cache_creation_tokens),
                costUsd: toNumber(attributes.cost_usd),
                promptLength: toNumber(attributes.prompt_length),
                prompt: truncate(toStringValue(attributes.prompt), 20000),
                toolName: toStringValue(attributes.tool_name),
                success: toBoolean(attributes.success),
                durationMs: toNumber(attributes.duration_ms),
                error: truncate(toStringValue(attributes.error), 4000),
                body: truncate(
                    bodyString && bodyString !== eventName ? bodyString : undefined,
                    4000,
                ),
                rawAttributes: safeStringify(attributes, 16000),
            };

            events.push(normalizedEvent);
        }
    }

    return events;
}

function normalizeResourceMetrics(resourceMetric: unknown, receivedAtMs: number) {
    const events: NormalizedEvent[] = [];
    const resourceMetricObject = asObject(resourceMetric);

    if (!resourceMetricObject) {
        return events;
    }

    const resourceAttributes = parseAttributes(
        asObject(resourceMetricObject.resource)?.attributes,
    );
    const scopeMetrics = extractScopeMetrics(resourceMetricObject);

    for (const scopeMetric of scopeMetrics) {
        const scopeMetricObject = asObject(scopeMetric);
        if (!scopeMetricObject) {
            continue;
        }

        const metrics = asArray(scopeMetricObject.metrics);
        for (const metric of metrics) {
            const metricObject = asObject(metric);
            if (!metricObject) {
                continue;
            }

            const metricName = toStringValue(metricObject.name);
            if (metricName !== "claude_code.token.usage") {
                continue;
            }

            const metricDataPoints = extractMetricDataPoints(metricObject);

            for (const dataPoint of metricDataPoints) {
                const dataPointObject = asObject(dataPoint);
                if (!dataPointObject) {
                    continue;
                }

                const dataPointAttributes = parseAttributes(dataPointObject.attributes);
                const attributes = {
                    ...resourceAttributes,
                    ...dataPointAttributes,
                };

                const usageType = toStringValue(attributes.type);
                const value = toMetricValue(dataPointObject);
                if (value === undefined) {
                    continue;
                }

                const sessionId = toStringValue(attributes["session.id"]);
                const eventTimestamp =
                    toIsoTimestampFromUnixNano(dataPointObject.timeUnixNano) ??
                    toIsoTimestampFromUnixNano(dataPointObject.startTimeUnixNano);

                const normalizedMetricEvent: NormalizedEvent = {
                    receivedAtMs,
                    dedupeKey: buildMetricDedupeKey({
                        metricName,
                        usageType,
                        sessionId,
                        model: toStringValue(attributes.model),
                        timestamp: eventTimestamp,
                        value,
                    }),
                    eventName: `metric.${metricName}`,
                    sessionId,
                    eventTimestamp,
                    model: toStringValue(attributes.model),
                    inputTokens: usageType === "input" ? value : undefined,
                    outputTokens: usageType === "output" ? value : undefined,
                    cacheReadTokens: usageType === "cacheRead" ? value : undefined,
                    cacheCreationTokens:
                        usageType === "cacheCreation" ? value : undefined,
                    rawAttributes: safeStringify(attributes, 16000),
                };

                events.push(normalizedMetricEvent);
            }
        }
    }

    return events;
}

function extractMetricDataPoints(metricObject: Record<string, unknown>) {
    const sumDataPoints = asArray(asObject(metricObject.sum)?.dataPoints);
    if (sumDataPoints.length > 0) {
        return sumDataPoints;
    }

    const gaugeDataPoints = asArray(asObject(metricObject.gauge)?.dataPoints);
    if (gaugeDataPoints.length > 0) {
        return gaugeDataPoints;
    }

    return [] as unknown[];
}

function extractScopeLogs(resourceLogObject: Record<string, unknown>) {
    const scopeLogs = asArray(resourceLogObject.scopeLogs);
    if (scopeLogs.length > 0) {
        return scopeLogs;
    }

    return asArray(resourceLogObject.instrumentationLibraryLogs);
}

function extractScopeMetrics(resourceMetricObject: Record<string, unknown>) {
    const scopeMetrics = asArray(resourceMetricObject.scopeMetrics);
    if (scopeMetrics.length > 0) {
        return scopeMetrics;
    }

    return asArray(resourceMetricObject.instrumentationLibraryMetrics);
}

function toMetricValue(dataPointObject: Record<string, unknown>) {
    const asInt = toNumber(dataPointObject.asInt);
    if (asInt !== undefined) {
        return asInt;
    }

    const asDouble = toNumber(dataPointObject.asDouble);
    if (asDouble !== undefined) {
        return asDouble;
    }

    const value = toNumber(dataPointObject.value);
    if (value !== undefined) {
        return value;
    }

    return undefined;
}

function parseAttributes(rawAttributes: unknown) {
    const entries = asArray(rawAttributes);
    const attributes: Record<string, unknown> = {};

    for (const entry of entries) {
        const entryObject = asObject(entry);
        if (!entryObject) {
            continue;
        }

        const key = toStringValue(entryObject.key);
        if (!key) {
            continue;
        }

        attributes[key] = parseAnyValue(entryObject.value);
    }

    return attributes;
}

function parseAnyValue(rawValue: unknown): unknown {
    const valueObject = asObject(rawValue);

    if (!valueObject) {
        return rawValue;
    }

    if ("stringValue" in valueObject) {
        return toStringValue(valueObject.stringValue);
    }

    if ("boolValue" in valueObject) {
        return toBoolean(valueObject.boolValue);
    }

    if ("intValue" in valueObject) {
        return toNumber(valueObject.intValue);
    }

    if ("doubleValue" in valueObject) {
        return toNumber(valueObject.doubleValue);
    }

    if ("bytesValue" in valueObject) {
        return toStringValue(valueObject.bytesValue);
    }

    if ("arrayValue" in valueObject) {
        const values = asArray(asObject(valueObject.arrayValue)?.values);
        return values.map((item) => parseAnyValue(item));
    }

    if ("kvlistValue" in valueObject) {
        const kvPairs = asArray(asObject(valueObject.kvlistValue)?.values);
        const mapped: Record<string, unknown> = {};

        for (const pair of kvPairs) {
            const pairObject = asObject(pair);
            if (!pairObject) {
                continue;
            }

            const pairKey = toStringValue(pairObject.key);
            if (!pairKey) {
                continue;
            }

            mapped[pairKey] = parseAnyValue(pairObject.value);
        }

        return mapped;
    }

    return valueObject;
}

function normalizeEventName(rawEventName: unknown, body: string | undefined) {
    const eventName = toStringValue(rawEventName);
    if (eventName && eventName.length > 0) {
        if (eventName.startsWith("claude_code.")) {
            return eventName;
        }

        return `claude_code.${eventName}`;
    }

    if (body?.startsWith("claude_code.")) {
        return body;
    }

    return "claude_code.unknown";
}

function buildLogDedupeKey(args: {
    eventName: string;
    sessionId?: string;
    promptId?: string;
    eventSequence?: number;
    eventTimestamp?: string;
    body?: string;
    attributes: Record<string, unknown>;
}) {
    const payloadHash = hashString(
        `${safeStringify(args.attributes, 12000)}|${args.body ?? ""}`,
    );

    return [
        "log",
        args.eventName,
        args.sessionId ?? "",
        args.promptId ?? "",
        args.eventSequence?.toString() ?? "",
        args.eventTimestamp ?? "",
        payloadHash,
    ].join("|");
}

function buildMetricDedupeKey(args: {
    metricName: string;
    usageType?: string;
    sessionId?: string;
    model?: string;
    timestamp?: string;
    value: number;
}) {
    return [
        "metric",
        args.metricName,
        args.usageType ?? "",
        args.sessionId ?? "",
        args.model ?? "",
        args.timestamp ?? "",
        args.value.toString(),
    ].join("|");
}

function toIsoTimestampFromUnixNano(rawValue: unknown) {
    const value = toNumber(rawValue);
    if (value === undefined) {
        return undefined;
    }

    const timestampMs = value / 1_000_000;
    if (!Number.isFinite(timestampMs)) {
        return undefined;
    }

    return new Date(timestampMs).toISOString();
}

function toStringValue(rawValue: unknown) {
    if (typeof rawValue === "string") {
        return rawValue;
    }

    if (typeof rawValue === "number" || typeof rawValue === "boolean") {
        return String(rawValue);
    }

    return undefined;
}

function toBoolean(rawValue: unknown) {
    if (typeof rawValue === "boolean") {
        return rawValue;
    }

    if (typeof rawValue === "string") {
        if (rawValue.toLowerCase() === "true") {
            return true;
        }

        if (rawValue.toLowerCase() === "false") {
            return false;
        }
    }

    return undefined;
}

function toNumber(rawValue: unknown) {
    if (typeof rawValue === "number") {
        return Number.isFinite(rawValue) ? rawValue : undefined;
    }

    if (typeof rawValue === "string") {
        const parsed = Number.parseFloat(rawValue);
        return Number.isFinite(parsed) ? parsed : undefined;
    }

    return undefined;
}

function asObject(value: unknown) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return null;
    }

    return value as Record<string, unknown>;
}

function asArray(value: unknown) {
    return Array.isArray(value) ? value : [];
}

function truncate(value: string | undefined, maxLength: number) {
    if (!value) {
        return undefined;
    }

    if (value.length <= maxLength) {
        return value;
    }

    return `${value.slice(0, maxLength)}...`;
}

function safeStringify(value: unknown, maxLength: number) {
    try {
        const stringified = JSON.stringify(value);
        if (typeof stringified !== "string") {
            return undefined;
        }

        return truncate(stringified, maxLength);
    } catch {
        return undefined;
    }
}

function hashString(value: string) {
    let hash = 0x811c9dc5;

    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }

    return (hash >>> 0).toString(16);
}

function chunkArray<T>(items: T[], chunkSize: number) {
    const chunks: T[][] = [];

    for (let index = 0; index < items.length; index += chunkSize) {
        chunks.push(items.slice(index, index + chunkSize));
    }

    return chunks;
}
