# claude-code-otel

Claude Code usage dashboard built with Next.js + Convex.

## What this dashboard shows

- Total input tokens and total output tokens (separately)
- Sessions table with token usage per session
- Individual message rows (prompt-level when `prompt.id` is available)

## OTEL ingestion architecture

Claude Code OTLP telemetry is sent to Convex HTTP routes:

- `POST /otel/webhook`
- `POST /v1/logs`
- `POST /v1/metrics`

All ingestion routes require `Authorization: Bearer <OTEL_INGEST_TOKEN>`. The webhook normalizes OTLP logs/metrics JSON and stores records in the Convex `claudeEvents` table. The dashboard reads from `api.otel.getDashboardData`.

## Setup

### 1. Install dependencies

```bash
bun install   # or: npm install
```

### 2. Configure the Next.js app

Copy `.env.example` to `.env.local` and fill in:

```bash
# HMAC signing secret for the dashboard session cookie
# Generate with: openssl rand -hex 32
BETTER_AUTH_SECRET="..."
BETTER_AUTH_URL="http://localhost:3000"

# Password for the dashboard login page
DASHBOARD_PASSWORD="your-secure-password-here"
```

### 3. Start Convex and set the ingest token

In one terminal:

```bash
npx convex dev
```

On first run this provisions a Convex deployment and writes `CONVEX_URL` into `.env.local`. Then set the shared bearer token used to authenticate OTEL ingestion:

```bash
# Generate with: openssl rand -hex 32
npx convex env set OTEL_INGEST_TOKEN <value>
```

Keep this value — you'll need it again when pointing Claude Code at the dashboard.

### 4. Start the Next.js app

In another terminal:

```bash
bun run dev   # or: npm run dev
```

Visit http://localhost:3000 and log in with `DASHBOARD_PASSWORD`.

## Point Claude Code OTEL at Convex

Claude Code reads OTEL configuration from environment variables. Set these before running `claude`:

```bash
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_LOGS_EXPORTER=otlp
export OTEL_METRICS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=http/json

# Local Convex dev backend (default port 3210).
# For a deployed Convex project, use https://<your-deployment>.convex.site instead.
export OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=http://127.0.0.1:3210/v1/logs
export OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=http://127.0.0.1:3210/v1/metrics

# Bearer token — must match what you set via `npx convex env set OTEL_INGEST_TOKEN`
export OTEL_EXPORTER_OTLP_HEADERS="OTEL_INGEST_TOKEN=<OTEL_INGEST_TOKEN>"

# Optional: include full user prompt text in the dashboard
export OTEL_LOG_USER_PROMPTS=1
```

Then run `claude` as normal — events will appear in the dashboard.

To make this persistent, add the exports to your shell profile (`~/.bashrc`, `~/.zshrc`, or a per-project `.envrc`). On Windows PowerShell use `$env:NAME = "value"`.

If you already run an OTEL collector, forward logs/metrics to one of the Convex routes above with the same `OTEL_INGEST_TOKEN` header.

## Notes

- If `claude_code.api_request` events are present, token totals use them.
- If API request events are missing, totals fall back to `claude_code.token.usage` metric events.
- Prompt text only appears when `OTEL_LOG_USER_PROMPTS=1` is set.
- Requests without a valid `OTEL_INGEST_TOKEN` header are rejected with 401.
