# Features and benefits

Ops Pilot is a small Developer Operations Agent that investigates simulated service incidents with real OpenAI function calling. The model chooses which tools to use, the backend executes them against deterministic local data, and the UI exposes both the answer and the execution trail.

## At a glance

| Area | What the project demonstrates |
| --- | --- |
| Investigation | Multi-step evidence gathering selected by the model |
| Tool calling | Strict, typed functions executed by the backend |
| Safety | Explicit approval before retrying a payment |
| Auditability | Ordered trace from user request to final answer |
| Operations data | Services, errors, runbooks, payments, and incident notes |
| Quality | Unit, integration, scenario tests, type checks, and CI builds |

## Main workflows

### Investigate an operational problem

A user can ask a broad question such as:

```text
Payments are failing. Can you investigate?
```

The agent can independently inspect service health, query recent errors, search the runbook, and combine the returned evidence into a final response. The answer is based on tool results rather than facts embedded in the prompt.

### Create an incident note

When the user explicitly asks to record an investigation, the agent can collect evidence and create a local incident note containing:

- the affected service
- a concise title
- factual investigation details
- a server-controlled creation timestamp

The note remains in the in-memory operational store until the API restarts.

### Retry a failed payment safely

The agent can inspect a known payment and request `retry_payment`. This tool does not execute immediately:

1. The backend validates the arguments and prepares a confirmation request.
2. The current agent run is paused.
3. The UI shows the exact tool name, payment identifier, amount, currency, and provider.
4. The user cancels or confirms the action.
5. The backend sends the decision and tool result back to the model.
6. The model produces a final response that reflects what actually happened.

Cancelling leaves the payment unchanged. Confirming revalidates the payment and moves a retryable gateway-timeout failure to `processing`.

## Tool catalog

| Tool | Purpose | Side effect | Confirmation |
| --- | --- | --- | --- |
| `get_service_health` | Read the latest status and latency of a service | None | No |
| `get_recent_errors` | Read error groups from the last 10 minutes | None | No |
| `search_runbook` | Find up to three relevant runbook sections | None | No |
| `get_payment` | Inspect a payment and its failure details | None | No |
| `create_incident_note` | Store a local note requested by the user | Local write | No |
| `retry_payment` | Queue one retry of an eligible failed payment | Payment state change | Always |

All tool arguments are described with strict Zod schemas. The same schemas generate OpenAI function definitions and validate model-provided JSON before execution.

## Simulated operations environment

The deterministic local dataset contains:

- `payments-api`, `notifications-api`, and `user-service`
- healthy, degraded, and recent-error examples
- payment gateway timeout, provider rate-limit, and authentication data
- searchable payment, notification, and authentication runbooks
- successful, failed, and processing payments
- incident notes created during the current API process

This makes demonstrations and tests repeatable without requiring access to real production infrastructure.

## Chat UI

The Next.js interface provides:

- natural-language requests and agent answers
- ready-to-use example prompts
- loading and error states
- a visible confirmation card for dangerous actions
- disabled input while an action is awaiting a decision
- links between the Chat and Agent Trace views
- responsive desktop and mobile layouts

## Agent Trace

Every run produces an ordered trace that can contain:

- the user message
- each model response round
- tool names, call identifiers, and arguments
- structured tool results
- confirmation requests and user decisions
- the final answer

The Chat view shows the trace beside the conversation. A dedicated `/trace` route adds filters, step counts, tool-call statistics, result status indicators, and JSON copying. The latest trace is stored only in the current browser tab.

## API

The Fastify backend exposes:

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Verify that the API process is running |
| `POST /api/agent/run` | Start a new agent run with a user message |
| `POST /api/agent/confirm` | Resolve one pending confirmation |

Agent responses use a discriminated result:

- `status: "completed"` includes the answer and complete trace.
- `status: "requires_confirmation"` includes the pending action and trace so far.

## Tests and CI

The automated suite covers:

- local store behavior and defensive cloning
- strict tool definitions and argument validation
- tool execution success and failure paths
- multi-round response history
- the maximum tool-round limit
- confirmation, cancellation, and single-use approvals
- complete investigation, incident-note, and payment-retry scenarios
- Fastify route behavior

Scenario tests use the real store, tools, and agent loop while scripting only the OpenAI gateway. They are deterministic, do not consume API credits, and do not require an OpenAI API key.

GitHub Actions runs tests, TypeScript checks, and production builds for pull requests and changes to `master`.

## Why the project is useful

- **Real agent behavior:** the model chooses tools across multiple rounds instead of receiving precomputed context in one prompt.
- **Visible safety boundary:** a dangerous operation cannot execute because the model merely requested it.
- **Auditable execution:** the answer can be compared with the calls and results that produced it.
- **Runtime validation:** TypeScript types are backed by Zod checks at the model boundary.
- **Deterministic demonstration:** local fixtures make behavior easy to run, explain, and test.
- **Clear extension path:** local tools can later be complemented by database-backed or MCP-provided tools.
- **Portfolio value:** the project demonstrates agent orchestration, backend safety, UI state handling, testing, and CI in a compact codebase.

For the reasoning behind the implementation choices and the current MVP constraints, see [Technical decisions](TECHNICAL_DECISIONS.md).
