# Ops Pilot

[![CI](https://github.com/Robert-Sawyer/ops-pilot/actions/workflows/ci.yml/badge.svg)](https://github.com/Robert-Sawyer/ops-pilot/actions/workflows/ci.yml)

Ops Pilot is a small Developer Operations Agent built to demonstrate real AI tool calling in a practical backend workflow.

It investigates fictional service incidents, queries local operational data, searches runbooks, creates incident notes, and requests user confirmation before running dangerous actions.

## Current status

Stages 1 through 3 are complete: the repository contains a TypeScript monorepo, a typed in-memory operational data store, strict operational tools, and a working OpenAI Responses API tool-calling loop exposed through Fastify.

## Example

**User:** `Payments are failing. Can you investigate?`

The agent will independently call tools such as:

1. `get_service_health("payments-api")`
2. `get_recent_errors("payments-api")`
3. `search_runbook("payment gateway timeout")`

It then produces an evidence-based answer, for example:

> Payments API is healthy, but 17 requests failed with gateway timeout errors during the last 10 minutes. The runbook recommends checking provider availability before retrying requests.

For a risky request such as `Retry the failed payment`, the backend will return a pending confirmation instead of executing immediately. The UI will let the user explicitly cancel or confirm the requested tool call.

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
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── agent/     # OpenAI tool-calling loop and trace types
│   │       ├── data/      # domain types, fixtures, and local store
│   │       ├── routes/    # Fastify agent endpoint
│   │       └── tools/     # typed operational tool registry
│   └── web/               # Next.js frontend
├── package.json           # npm workspaces and root commands
└── tsconfig.base.json     # shared TypeScript compiler settings
```

## Getting started

**Requirements:** Node.js 22 or newer, npm, and an OpenAI API key.

```bash
npm install
cp apps/api/.env.example apps/api/.env
npm run dev
```

Set `OPENAI_API_KEY` in `apps/api/.env`. `OPENAI_MODEL` is configurable and defaults to `gpt-5-mini`.

The frontend starts at [http://localhost:3000](http://localhost:3000) and the API at [http://localhost:3001](http://localhost:3001). You can check the API with [http://localhost:3001/health](http://localhost:3001/health).

The API reads `apps/api/.env`; the Next.js app uses `apps/web/.env.local` when frontend configuration is needed.

Useful commands:

```bash
npm test
npm run typecheck
npm run build
```

Pull requests to `master` run the same tests, TypeScript checks, and production builds in GitHub Actions.

## Agent API

Run an investigation with:

```bash
curl -X POST http://localhost:3001/api/agent/run \
  -H "Content-Type: application/json" \
  -d '{"message":"Payments are failing. Can you investigate?"}'
```

The endpoint returns the final `answer` and an ordered `trace` containing the user message, model rounds, tool calls, tool results, and final answer. The loop preserves every model output and sends JSON `function_call_output` items back to the model until it produces a final response. Runs are limited to eight tool rounds.

## Local operational data

The API includes deterministic sample data for:

- health snapshots of `payments-api`, `notifications-api`, and `user-service`
- recent service errors, including 17 payment gateway timeouts
- searchable runbook sections for payments, notifications, and authentication
- successful, failed, and processing payments, including `payment_123`
- incident notes created by the agent when explicitly requested

The store supports health lookup, time-filtered errors, ranked runbook search, payment lookup and filtering, and payment updates. Returned records are cloned to prevent accidental mutation of the underlying fixture state.

This store is intentionally in-memory for the MVP. Its state resets whenever the API process restarts.

## Core services

- `payments-api`
- `notifications-api`
- `user-service`

## Initial tools

- `get_service_health(service)`
- `get_recent_errors(service)`
- `search_runbook(query)`
- `get_payment(paymentId)`
- `create_incident_note(service, title, content)`

`retry_payment(paymentId)` is deliberately not available yet. It will be introduced with the explicit confirmation flow for dangerous tools.

## Key product views

- Chat workspace for investigating operational issues
- Confirmation dialog for dangerous tool calls
- Agent trace showing user messages, model steps, tool calls, tool results, and final answers

## Goals

- Demonstrate genuine multi-step tool calling instead of a prompt-only simulation.
- Keep tool execution explicit, typed, auditable, and safe.
- Provide a compact portfolio project focused on AI-agent backend patterns.
