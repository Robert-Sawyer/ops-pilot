# Ops Pilot

Ops Pilot is a small Developer Operations Agent built to demonstrate real AI tool calling in a practical backend workflow.

It investigates fictional service incidents, queries local operational data, searches runbooks, creates incident notes, and requests user confirmation before running dangerous actions.

## Example

**User:** `Payments are failing. Can you investigate?`

The agent can independently call tools such as:

1. `get_service_health("payments-api")`
2. `get_recent_errors("payments-api")`
3. `search_runbook("payment gateway timeout")`

It then produces an evidence-based answer, for example:

> Payments API is healthy, but 17 requests failed with gateway timeout errors during the last 10 minutes. The runbook recommends checking provider availability before retrying requests.

For a risky request such as `Retry the failed payment`, the backend returns a pending confirmation instead of executing immediately. The UI lets the user explicitly cancel or confirm the requested tool call.

## Planned stack

- React or Next.js frontend
- Fastify API
- TypeScript
- OpenAI SDK with function/tool calling
- Small local dataset for services, errors, runbooks, payments, and incident notes
- Optional MCP adapter after the MVP

## Core services

- `payments-api`
- `notifications-api`
- `user-service`

## Initial tools

- `get_service_health(service)`
- `get_recent_errors(service)`
- `search_runbook(query)`
- `create_incident_note(...)`
- `retry_payment(paymentId)` — requires confirmation

## Key product views

- Chat workspace for investigating operational issues
- Confirmation dialog for dangerous tool calls
- Agent trace showing user messages, model steps, tool calls, tool results, and final answers

## Goals

- Demonstrate genuine multi-step tool calling instead of a prompt-only simulation.
- Keep tool execution explicit, typed, auditable, and safe.
- Provide a compact portfolio project focused on AI-agent backend patterns.

## Status

Planning / MVP not yet implemented.
