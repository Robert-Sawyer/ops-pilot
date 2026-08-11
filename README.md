# Ops Pilot

[![CI](https://github.com/Robert-Sawyer/ops-pilot/actions/workflows/ci.yml/badge.svg)](https://github.com/Robert-Sawyer/ops-pilot/actions/workflows/ci.yml)

Ops Pilot is a small Developer Operations Agent built to demonstrate real AI tool calling in a practical backend workflow.

It investigates fictional service incidents, queries local operational data, searches runbooks, creates incident notes, and requests user confirmation before running dangerous actions.

## Run the project locally

### Requirements

- Node.js 22 or newer
- npm
- an OpenAI API key

### 1. Install dependencies

Run this command from the repository root:

```bash
npm install
```

### 2. Configure the backend

Create the local API environment file.

On Windows PowerShell:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
```

On macOS or Linux:

```bash
cp apps/api/.env.example apps/api/.env
```

Open `apps/api/.env` and set your key:

```dotenv
OPENAI_API_KEY=your_openai_api_key
```

The default model is `gpt-5-mini`. You can change it with `OPENAI_MODEL` in the same file.

### 3. Start the frontend and backend

Run both applications together from the repository root:

```bash
npm run dev
```

Once both applications are ready, open:

- Chat UI: [http://localhost:3000](http://localhost:3000)
- Fastify API: [http://localhost:3001](http://localhost:3001)
- API health check: [http://localhost:3001/health](http://localhost:3001/health)

The root command starts the Next.js frontend and Fastify backend at the same time. Stop both with `Ctrl+C`.

### Start the applications separately (optional)

Use two terminals from the repository root if you want separate logs.

Terminal 1 - backend:

```bash
npm run dev --workspace @ops-pilot/api
```

Terminal 2 - frontend:

```bash
npm run dev --workspace @ops-pilot/web
```

The frontend connects to `http://localhost:3001` by default. To use another API address, copy `apps/web/.env.example` to `apps/web/.env.local` and change `NEXT_PUBLIC_API_BASE_URL`.

## Current status

Stages 1 through 6 are complete: the repository contains a TypeScript monorepo, typed local operational data, strict operational tools, an OpenAI Responses API tool-calling loop, a chat interface, explicit approval handling for dangerous actions, a dedicated Agent Trace screen, and deterministic agent scenario tests.

## Example

**User:** `Payments are failing. Can you investigate?`

The agent will independently call tools such as:

1. `get_service_health("payments-api")`
2. `get_recent_errors("payments-api")`
3. `search_runbook("payment gateway timeout")`

It then produces an evidence-based answer, for example:

> Payments API is healthy, but 17 requests failed with gateway timeout errors during the last 10 minutes. The runbook recommends checking provider availability before retrying requests.

For a risky request such as `Retry payment_123`, the agent prepares `retry_payment("payment_123")` but does not execute it. The Chat UI displays the requested action and waits for an explicit **Cancel** or **Confirm retry** decision.

## Tech stack

- Next.js 15 and React 19 frontend
- Fastify API
- TypeScript
- OpenAI SDK with Responses API function calling
- Zod schemas for typed tool arguments and runtime validation
- Typed in-memory dataset for services, errors, runbooks, payments, and incident notes
- Optional MCP adapter after the MVP

## Repository structure

```text
ops-pilot/
|-- apps/
|   |-- api/
|   |   `-- src/
|   |       |-- agent/       # OpenAI loop, trace, paused runs, and scenarios
|   |       |-- data/        # domain types, fixtures, and local store
|   |       |-- routes/      # Fastify agent endpoints
|   |       `-- tools/       # typed operational tools and policies
|   `-- web/
|       `-- app/
|           |-- trace/      # dedicated Agent Trace route
|           `-- components/ # Chat UI, trace timeline, and shared navigation
|-- package.json             # npm workspaces and root commands
`-- tsconfig.base.json       # shared TypeScript compiler settings
```

## Chat and confirmation flow

The workspace shows agent answers and an ordered execution trace. Safe tools run immediately. A dangerous tool returns `requiresConfirmation: true`, and the backend keeps the paused run in memory without executing the action.

Confirming or cancelling sends the decision to the API. The backend consumes the pending confirmation once, either executes the approved tool or records the cancellation, and then lets the model produce its final response. Confirmations expire after 10 minutes and cannot be replayed.

## Agent Trace screen

Open [http://localhost:3000/trace](http://localhost:3000/trace) or use the **Agent trace** navigation item after running an investigation. The screen presents the latest execution as an ordered audit timeline containing:

- the user's message and the agent's final answer
- each model response round and its response identifier
- tool names, call identifiers, and formatted arguments
- tool execution results with success or error status
- confirmation requests and the user's decision

The full-screen view also provides step counts, filters for messages, tools, and decisions, plus an option to copy the complete trace as JSON. The latest trace is stored in `sessionStorage`, so it survives navigation and page refreshes in the current browser tab but is cleared when that tab is closed.

## Agent API

Start an investigation:

```bash
curl -X POST http://localhost:3001/api/agent/run \
  -H "Content-Type: application/json" \
  -d '{"message":"Payments are failing. Can you investigate?"}'
```

A completed run returns `status: "completed"`, `requiresConfirmation: false`, the final `answer`, and an ordered `trace`.

A dangerous action returns `status: "requires_confirmation"`, `requiresConfirmation: true`, a confirmation description, and the trace so far. Resolve it with:

```bash
curl -X POST http://localhost:3001/api/agent/confirm \
  -H "Content-Type: application/json" \
  -d '{"confirmationId":"the_returned_confirmation_id","approved":true}'
```

Set `approved` to `false` to cancel. The continuation response contains either another pending confirmation or the completed agent answer.

## Local operational data

The API includes deterministic sample data for:

- health snapshots of `payments-api`, `notifications-api`, and `user-service`
- recent service errors, including 17 payment gateway timeouts
- searchable runbook sections for payments, notifications, and authentication
- successful, failed, and processing payments, including `payment_123`
- incident notes created by the agent when explicitly requested

The store supports health lookup, time-filtered errors, ranked runbook search, payment lookup and filtering, incident notes, and validated payment state updates. Returned records are cloned to prevent accidental mutation of fixture state.

This store and all pending confirmations are intentionally in memory for the MVP. Their state resets whenever the API process restarts.

## Initial tools

- `get_service_health(service)`
- `get_recent_errors(service)`
- `search_runbook(query)`
- `get_payment(paymentId)`
- `create_incident_note(service, title, content)`
- `retry_payment(paymentId)` - always requires explicit user confirmation

## Agent scenario tests

The API test suite includes deterministic scenarios that run the complete agent loop against the real typed tools and local data store:

- investigation of payment failures using service health, recent errors, and runbook evidence
- creation of an incident note from investigated operational data
- payment retry cancellation, verifying that the failed payment remains unchanged
- payment retry confirmation, verifying that execution happens only after approval

Only the Responses API gateway is scripted, so the tests do not send requests to OpenAI and do not require an API key. They validate the tool outputs returned to the model, the resulting agent trace, and persisted local state changes.

## Quality checks

```bash
npm test
npm run typecheck
npm run build
```

Pull requests to `master` run the same tests, TypeScript checks, and production builds in GitHub Actions.

## Goals

- Demonstrate genuine multi-step tool calling instead of a prompt-only simulation.
- Keep tool execution explicit, typed, auditable, and safe.
- Provide a compact portfolio project focused on AI-agent backend patterns.
