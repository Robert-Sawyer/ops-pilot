# Ops Pilot

[![CI](https://github.com/Robert-Sawyer/ops-pilot/actions/workflows/ci.yml/badge.svg)](https://github.com/Robert-Sawyer/ops-pilot/actions/workflows/ci.yml)

Ops Pilot is a compact Developer Operations Agent that investigates simulated service incidents with real OpenAI function calling.

The model chooses which typed tools to call, the Fastify backend executes them against local operational data, and the Next.js UI shows both the final answer and an auditable Agent Trace. Dangerous actions are paused until the user explicitly confirms or cancels them.

## Documentation

- [Features and benefits](docs/FEATURES.md) - workflows, tools, UI capabilities, testing, and project value
- [Technical decisions](docs/TECHNICAL_DECISIONS.md) - architecture choices, trade-offs, and current MVP boundaries

## What this project demonstrates

- genuine multi-step tool calling rather than a prompt-only simulation
- strict tool schemas with runtime argument validation
- backend-enforced confirmation for a dangerous tool
- manual Responses API continuation with structured tool results
- an ordered trace of messages, model rounds, tool calls, results, and decisions
- deterministic scenario tests that do not call the OpenAI API

## Example workflows

| User request | Typical agent behavior |
| --- | --- |
| `Payments are failing. Can you investigate?` | Checks health, reads recent errors, searches a runbook, and summarizes evidence |
| `Investigate payment errors and create an incident note.` | Collects evidence and writes a local incident note |
| `Retry payment_123.` | Inspects the payment and pauses before `retry_payment` until the user decides |

Example investigation sequence:

```text
User message
    -> get_service_health("payments-api")
    -> get_recent_errors("payments-api")
    -> search_runbook("payment gateway timeout")
    -> evidence-based final answer
```

## Architecture

```text
Next.js / React
       |
       | HTTP
       v
Fastify API
       |
       | Responses API function calls
       v
OpenAI model
       |
       | typed tool requests
       v
Tool registry -> local services, errors, runbooks, payments, incident notes
```

The model can request a tool but cannot execute application code directly. Fastify validates the arguments, applies the confirmation policy, runs the selected tool, and sends a structured result back to the model.

## Tech stack

- TypeScript
- OpenAI TypeScript SDK and Responses API
- Fastify
- Next.js 15 and React 19
- Zod
- npm workspaces
- native Node.js test runner
- GitHub Actions

## Run locally

### Requirements

- Node.js 22 or newer
- npm
- an OpenAI API key

### 1. Install dependencies

From the repository root:

```bash
npm install
```

### 2. Configure the API

Windows PowerShell:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
```

macOS or Linux:

```bash
cp apps/api/.env.example apps/api/.env
```

Set the key in `apps/api/.env`:

```dotenv
OPENAI_API_KEY=your_openai_api_key
```

`OPENAI_MODEL` is optional and defaults to `gpt-5-mini`.

### 3. Start both applications

```bash
npm run dev
```

Open:

- Chat UI: [http://localhost:3000](http://localhost:3000)
- Agent Trace: [http://localhost:3000/trace](http://localhost:3000/trace)
- Fastify API: [http://localhost:3001](http://localhost:3001)
- API health check: [http://localhost:3001/health](http://localhost:3001/health)

The root command starts the frontend and backend together. Stop both with `Ctrl+C`.

### Start applications separately

Terminal 1 - API:

```bash
npm run dev --workspace @ops-pilot/api
```

Terminal 2 - web:

```bash
npm run dev --workspace @ops-pilot/web
```

The frontend uses `http://localhost:3001` by default. To change it, copy `apps/web/.env.example` to `apps/web/.env.local` and update `NEXT_PUBLIC_API_BASE_URL`.

## Available tools

| Tool | Behavior |
| --- | --- |
| `get_service_health(service)` | Reads current service health |
| `get_recent_errors(service)` | Reads error groups from the last 10 minutes |
| `search_runbook(query)` | Returns up to three relevant runbook sections |
| `get_payment(paymentId)` | Reads payment status and failure details |
| `create_incident_note(...)` | Creates a local note when explicitly requested |
| `retry_payment(paymentId)` | Requires confirmation before changing payment state |

See [Features and benefits](docs/FEATURES.md) for complete workflow descriptions.

## API endpoints

### Start an agent run

```bash
curl -X POST http://localhost:3001/api/agent/run \
  -H "Content-Type: application/json" \
  -d '{"message":"Payments are failing. Can you investigate?"}'
```

The response is either completed or paused for confirmation:

- `status: "completed"` includes `answer` and `trace`.
- `status: "requires_confirmation"` includes `confirmation` and the trace so far.

### Resolve a confirmation

```bash
curl -X POST http://localhost:3001/api/agent/confirm \
  -H "Content-Type: application/json" \
  -d '{"confirmationId":"returned_confirmation_id","approved":true}'
```

Use `approved: false` to cancel. Confirmations are single-use and expire after 10 minutes.

## Repository structure

```text
ops-pilot/
|-- apps/
|   |-- api/                 # Fastify, agent loop, tools, store, and tests
|   `-- web/                 # Next.js Chat UI and Agent Trace
|-- docs/
|   |-- FEATURES.md
|   `-- TECHNICAL_DECISIONS.md
|-- .github/workflows/ci.yml
|-- package.json             # workspace commands
`-- tsconfig.base.json
```

## Quality checks

```bash
npm test
npm run typecheck
npm run build
```

The test suite covers the store, tools, agent loop, confirmation flow, API routes, and four complete agent scenarios. Only the OpenAI gateway is scripted in scenario tests, so they do not require an API key or consume API credits.

GitHub Actions runs the same tests, TypeScript checks, and production builds for pull requests and changes to `master`.

## MVP scope

Ops Pilot uses fictional data and intentionally keeps operational state and pending confirmations in memory. It has no authentication or real infrastructure integrations and should be treated as a portfolio demonstration, not a production operations system.

See [Technical decisions](docs/TECHNICAL_DECISIONS.md#current-mvp-boundaries) for the complete list of boundaries and extension points.
