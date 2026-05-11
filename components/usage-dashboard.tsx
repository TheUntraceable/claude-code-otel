"use client";

import { useQuery } from "convex/react";
import {
    Activity,
    ArrowDownRight,
    ArrowUpRight,
    Cpu,
    Database,
    DollarSign,
    Hash,
    Layers,
    Wrench,
    Zap
} from "lucide-react";

import { api } from "@/convex/_generated/api";

export function UsageDashboard() {
    const dashboardData = useQuery(api.otel.getDashboardData, {
        messageLimit: 100,
        sessionLimit: 25,
    });

    if (dashboardData === undefined) {
        return <DashboardSkeleton />;
    }

    const hasAnyEvents =
        dashboardData.counts.apiRequests > 0 ||
        dashboardData.counts.promptEvents > 0 ||
        dashboardData.counts.tokenMetricEvents > 0;

    const hasCost = dashboardData.totals.costUsd > 0;
    const hasCache = dashboardData.totals.cacheReadTokens > 0 || dashboardData.totals.cacheCreationTokens > 0;
    const topTool = dashboardData.tools[0] ?? null;

    return (
        <div className="min-h-screen bg-[#09090b]">
            {/* Nav */}
            <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#09090b]/80 backdrop-blur-xl">
                <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-6">
                    <div className="flex items-center gap-3">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white">
                            <Zap className="h-3.5 w-3.5 text-[#09090b]" />
                        </div>
                        <span className="text-[13px] font-medium text-white/90">Claude Code</span>
                        <span className="text-white/20">/</span>
                        <span className="text-[13px] text-white/40">Telemetry</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <a
                            href="/api/logout"
                            className="text-[11px] tracking-wide text-white/25 transition hover:text-white/50"
                        >
                            LOGOUT
                        </a>
                    </div>
                </div>
            </nav>

            <div className="mx-auto max-w-[1200px] px-6 py-10">
                {/* Primary Metrics */}
                <div className="grid grid-cols-2 gap-[1px] overflow-hidden rounded-xl bg-white/[0.04] ring-1 ring-white/[0.06] lg:grid-cols-4">
                    <MetricCard
                        label="Input Tokens"
                        value={fmt(dashboardData.totals.inputTokens)}
                        icon={<ArrowDownRight className="h-3.5 w-3.5" />}
                    />
                    <MetricCard
                        label="Output Tokens"
                        value={fmt(dashboardData.totals.outputTokens)}
                        icon={<ArrowUpRight className="h-3.5 w-3.5" />}
                    />
                    <MetricCard
                        label="API Requests"
                        value={fmt(dashboardData.counts.apiRequests)}
                        icon={<Cpu className="h-3.5 w-3.5" />}
                    />
                    {hasCost ? (
                        <MetricCard
                            label="Total Cost"
                            value={`$${dashboardData.totals.costUsd.toFixed(2)}`}
                            icon={<DollarSign className="h-3.5 w-3.5" />}
                        />
                    ) : (
                        <MetricCard
                            label="Sessions"
                            value={fmt(dashboardData.sessions.length)}
                            icon={<Layers className="h-3.5 w-3.5" />}
                        />
                    )}
                </div>

                {/* Secondary Metrics — cache + top tool row */}
                {(hasCache || topTool) && (
                    <div className={`mt-[1px] grid grid-cols-2 gap-[1px] overflow-hidden rounded-xl bg-white/[0.04] ring-1 ring-white/[0.06] ${hasCache && topTool ? "lg:grid-cols-4" : hasCache ? "lg:grid-cols-3" : "lg:grid-cols-1"}`}>
                        {hasCache && (
                            <>
                                <MetricCard
                                    label="Cache Read"
                                    value={fmt(dashboardData.totals.cacheReadTokens)}
                                    icon={<Database className="h-3.5 w-3.5" />}
                                    small
                                />
                                <MetricCard
                                    label="Cache Write"
                                    value={fmt(dashboardData.totals.cacheCreationTokens)}
                                    icon={<Database className="h-3.5 w-3.5" />}
                                    small
                                />
                                <MetricCard
                                    label="Total Tokens"
                                    value={fmt(dashboardData.totals.inputTokens + dashboardData.totals.outputTokens)}
                                    icon={<Hash className="h-3.5 w-3.5" />}
                                    small
                                />
                            </>
                        )}
                        {topTool && (
                            <MetricCard
                                label="Top Tool"
                                value={topTool.toolName}
                                icon={<Wrench className="h-3.5 w-3.5" />}
                                small
                            />
                        )}
                    </div>
                )}

                {/* Source */}
                <div className="mt-5 flex items-center gap-2.5">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-3 py-1 ring-1 ring-white/[0.06]">
                        <Activity className="h-3 w-3 text-white/30" />
                        <span className="font-mono text-[11px] text-white/40">
                            {humanReadableTokenSource(dashboardData.totals.source)}
                        </span>
                    </span>
                    {dashboardData.counts.tokenMetricEvents > 0 && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-3 py-1 ring-1 ring-white/[0.06]">
                            <Hash className="h-3 w-3 text-white/30" />
                            <span className="font-mono text-[11px] text-white/40">
                                {fmt(dashboardData.counts.tokenMetricEvents)} metrics
                            </span>
                        </span>
                    )}
                </div>

                {/* Models */}
                {dashboardData.models.length > 0 && (
                    <section className="mt-12">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-[13px] font-medium text-white/80">Models</h2>
                            <span className="font-mono text-[11px] text-white/25">
                                {dashboardData.models.length}
                            </span>
                        </div>
                        <div className="overflow-hidden rounded-xl ring-1 ring-white/[0.06]">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                                        <Th align="left">Model</Th>
                                        <Th>Input</Th>
                                        <Th>Output</Th>
                                        <Th>Total</Th>
                                        {hasCache && <Th>Cache Read</Th>}
                                        <Th>Requests</Th>
                                        <Th>Avg Latency</Th>
                                        {hasCost && <Th>Cost</Th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {dashboardData.models.map((model, i) => {
                                        const totalAllTokens = dashboardData.totals.inputTokens + dashboardData.totals.outputTokens;
                                        const pct = totalAllTokens > 0 ? ((model.totalTokens / totalAllTokens) * 100) : 0;
                                        return (
                                            <tr
                                                key={model.model}
                                                className={`transition-colors hover:bg-white/[0.02] ${i !== dashboardData.models.length - 1 ? "border-b border-white/[0.04]" : ""}`}
                                            >
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-3">
                                                        <span className="font-mono text-[12px] text-white/70">{model.model}</span>
                                                        <span className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-white/20">
                                                            {pct.toFixed(1)}%
                                                        </span>
                                                    </div>
                                                </td>
                                                <Td mono>{fmt(model.inputTokens)}</Td>
                                                <Td mono>{fmt(model.outputTokens)}</Td>
                                                <Td mono bright>{fmt(model.totalTokens)}</Td>
                                                {hasCache && <Td mono dim>{fmt(model.cacheReadTokens)}</Td>}
                                                <Td mono dim>{fmt(model.requestCount)}</Td>
                                                <td className="px-4 py-3 text-right font-mono text-[12px] tabular-nums text-white/30">
                                                    {model.avgDurationMs > 0 ? `${fmt(model.avgDurationMs)}ms` : "---"}
                                                </td>
                                                {hasCost && (
                                                    <td className="px-4 py-3 text-right font-mono text-[12px] tabular-nums text-white/50">
                                                        ${model.costUsd.toFixed(2)}
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}

                {/* Tools */}
                <section className="mt-12">
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-[13px] font-medium text-white/80">Tools</h2>
                        <span className="font-mono text-[11px] text-white/25">
                            {dashboardData.counts.toolEvents} calls
                        </span>
                    </div>
                    <div className="overflow-hidden rounded-xl ring-1 ring-white/[0.06]">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                                    <Th align="left">Tool</Th>
                                    <Th>Calls</Th>
                                    <Th>Success</Th>
                                    <Th>Failures</Th>
                                    <Th>Success Rate</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {dashboardData.tools.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-16 text-center text-[13px] text-white/25">
                                            No tool events yet. Claude Code emits these as <span className="font-mono text-white/40">claude_code.tool_use</span> log events.
                                        </td>
                                    </tr>
                                ) : (
                                    dashboardData.tools.map((tool, i) => {
                                        const totalCalls = dashboardData.counts.toolEvents;
                                        const pct = totalCalls > 0 ? ((tool.count / totalCalls) * 100) : 0;
                                        return (
                                            <tr
                                                key={tool.toolName}
                                                className={`transition-colors hover:bg-white/[0.02] ${i !== dashboardData.tools.length - 1 ? "border-b border-white/[0.04]" : ""}`}
                                            >
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-3">
                                                        <span className="font-mono text-[12px] text-white/70">{tool.toolName}</span>
                                                        <span className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-white/20">
                                                            {pct.toFixed(1)}%
                                                        </span>
                                                    </div>
                                                </td>
                                                <Td mono bright>{fmt(tool.count)}</Td>
                                                <td className="px-4 py-3 text-right font-mono text-[12px] tabular-nums text-emerald-500/70">
                                                    {tool.successCount > 0 ? fmt(tool.successCount) : <span className="text-white/20">---</span>}
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono text-[12px] tabular-nums text-red-400/70">
                                                    {tool.failureCount > 0 ? fmt(tool.failureCount) : <span className="text-white/20">---</span>}
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono text-[12px] tabular-nums">
                                                    {tool.successRate !== null ? (
                                                        <span className={tool.successRate >= 90 ? "text-emerald-500/70" : tool.successRate >= 70 ? "text-yellow-400/70" : "text-red-400/70"}>
                                                            {tool.successRate}%
                                                        </span>
                                                    ) : (
                                                        <span className="text-white/20">---</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* Sessions */}
                <section className="mt-12">
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-[13px] font-medium text-white/80">Sessions</h2>
                        <span className="font-mono text-[11px] text-white/25">
                            {dashboardData.sessions.length}
                        </span>
                    </div>
                    <div className="overflow-hidden rounded-xl ring-1 ring-white/[0.06]">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                                    <Th align="left">Session</Th>
                                    <Th>Input</Th>
                                    <Th>Output</Th>
                                    <Th>Total</Th>
                                    <Th>Prompts</Th>
                                    <Th>Requests</Th>
                                    <Th>Last Active</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {dashboardData.sessions.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-16 text-center text-[13px] text-white/25">
                                            {hasAnyEvents ? "No session data yet." : "No telemetry ingested yet."}
                                        </td>
                                    </tr>
                                ) : (
                                    dashboardData.sessions.map((session, i) => (
                                        <tr
                                            key={session.sessionId}
                                            className={`transition-colors hover:bg-white/[0.02] ${i !== dashboardData.sessions.length - 1 ? "border-b border-white/[0.04]" : ""}`}
                                        >
                                            <td className="max-w-[200px] px-4 py-3">
                                                <div className="truncate font-mono text-[11px] text-white/50" title={session.sessionId}>
                                                    {session.sessionId}
                                                </div>
                                            </td>
                                            <Td mono>{fmt(session.inputTokens)}</Td>
                                            <Td mono>{fmt(session.outputTokens)}</Td>
                                            <Td mono bright>{fmt(session.totalTokens)}</Td>
                                            <Td mono dim>{fmt(session.promptCount)}</Td>
                                            <Td mono dim>{fmt(session.apiRequestCount)}</Td>
                                            <td className="px-4 py-3 text-right text-[11px] text-white/25">
                                                {fmtDate(session.lastActivity)}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* Messages */}
                <section className="mt-12 pb-20">
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-[13px] font-medium text-white/80">Messages</h2>
                        <span className="font-mono text-[11px] text-white/25">
                            {dashboardData.messages.length}
                        </span>
                    </div>
                    <div className="overflow-hidden rounded-xl ring-1 ring-white/[0.06]">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                                    <Th align="left">Time</Th>
                                    <Th align="left">Session</Th>
                                    <Th>Input</Th>
                                    <Th>Output</Th>
                                    <Th>Reqs</Th>
                                    <Th align="left">Model</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {dashboardData.messages.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-16 text-center text-[13px] text-white/25">
                                            {hasAnyEvents
                                                ? "No messages yet. Set OTEL_LOGS_EXPORTER=otlp"
                                                : "No telemetry ingested yet."}
                                        </td>
                                    </tr>
                                ) : (
                                    dashboardData.messages.map((message, i) => (
                                        <tr
                                            key={message.id}
                                            className={`transition-colors hover:bg-white/[0.02] ${i !== dashboardData.messages.length - 1 ? "border-b border-white/[0.04]" : ""}`}
                                        >
                                            <td className="whitespace-nowrap px-4 py-3 text-[11px] text-white/25">
                                                {fmtDate(message.timestamp)}
                                            </td>
                                            <td className="max-w-[140px] px-4 py-3">
                                                <div className="truncate font-mono text-[11px] text-white/30" title={message.sessionId}>
                                                    {message.sessionId}
                                                </div>
                                            </td>
                                            <Td mono>{fmt(message.inputTokens)}</Td>
                                            <Td mono>{fmt(message.outputTokens)}</Td>
                                            <Td mono dim>{fmt(message.requestCount)}</Td>
                                            <td className="whitespace-nowrap px-4 py-3">
                                                {message.model ? (
                                                    <span className="inline-block rounded-md bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] text-white/35 ring-1 ring-white/[0.06]">
                                                        {message.model}
                                                    </span>
                                                ) : (
                                                    <span className="text-[11px] text-white/10">---</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>
        </div>
    );
}

function Th({ children, align = "right" }: { children: React.ReactNode; align?: "left" | "right" }) {
    return (
        <th className={`px-4 py-3 text-[11px] font-normal tracking-wider text-white/25 uppercase ${align === "left" ? "text-left" : "text-right"}`}>
            {children}
        </th>
    );
}

function Td({ children, mono, dim, bright }: { children: React.ReactNode; mono?: boolean; dim?: boolean; bright?: boolean }) {
    return (
        <td
            className={`px-4 py-3 text-right text-[12px] tabular-nums ${mono ? "font-mono" : ""} ${bright ? "font-medium text-white/80" : dim ? "text-white/20" : "text-white/50"}`}
        >
            {children}
        </td>
    );
}

function MetricCard({
    label,
    value,
    icon,
    small,
}: {
    label: string;
    value: string;
    icon: React.ReactNode;
    small?: boolean;
}) {
    return (
        <div className={`bg-[#09090b] px-5 ${small ? "py-4" : "py-5"}`}>
            <div className="flex items-center gap-2 text-white/30">
                {icon}
                <span className="text-[11px] tracking-wide uppercase">{label}</span>
            </div>
            <div className={`mt-2 font-mono font-semibold leading-none tabular-nums text-white/90 ${small ? "text-xl" : "mt-3 text-[28px]"} truncate`} title={value}>
                {value}
            </div>
        </div>
    );
}

function DashboardSkeleton() {
    return (
        <div className="min-h-screen bg-[#09090b]">
            <nav className="border-b border-white/[0.06]">
                <div className="mx-auto flex h-14 max-w-[1200px] items-center px-6">
                    <div className="h-4 w-36 animate-pulse rounded bg-white/[0.04]" />
                </div>
            </nav>
            <div className="mx-auto max-w-[1200px] px-6 py-10">
                <div className="grid grid-cols-2 gap-[1px] overflow-hidden rounded-xl bg-white/[0.04] ring-1 ring-white/[0.06] lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="bg-[#09090b] px-5 py-5">
                            <div className="h-3 w-16 animate-pulse rounded bg-white/[0.04]" />
                            <div className="mt-4 h-7 w-20 animate-pulse rounded bg-white/[0.04]" />
                        </div>
                    ))}
                </div>
                <div className="mt-12 h-40 animate-pulse rounded-xl bg-white/[0.02] ring-1 ring-white/[0.06]" />
                <div className="mt-12 h-56 animate-pulse rounded-xl bg-white/[0.02] ring-1 ring-white/[0.06]" />
                <div className="mt-12 h-80 animate-pulse rounded-xl bg-white/[0.02] ring-1 ring-white/[0.06]" />
            </div>
        </div>
    );
}

function fmt(value: number) {
    return new Intl.NumberFormat("en-US").format(Math.round(value));
}

function fmtDate(value: string) {
    const ts = Date.parse(value);
    if (!Number.isFinite(ts)) return value;

    const now = Date.now();
    const diffMs = now - ts;
    const diffMin = Math.floor(diffMs / 60_000);
    const diffHr = Math.floor(diffMs / 3_600_000);

    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;

    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(ts);
}

function humanReadableTokenSource(source: "api_request_events" | "token_usage_metrics" | "none") {
    if (source === "api_request_events") return "api_request";
    if (source === "token_usage_metrics") return "token_metric";
    return "none";
}
