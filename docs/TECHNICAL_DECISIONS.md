# Technical decisions

This document records the most important design choices in Ops Pilot. It is intentionally lightweight: it explains why the current approach fits the MVP, its trade-offs, and when the decision should be revisited.

## 1. OpenAI Responses API with direct function calling

**Decision:** Use the OpenAI TypeScript SDK and Responses API directly instead of simulating tools in a prompt or starting with the Agents SDK.

**Why:** The main learning goal is to expose the full tool-calling loop: receive a `function_call`, validate and execute it in application code, return a `function_call_output`, and continue until the model produces a final answer. Owning this loop makes execution, errors, confirmations, and trace generation explicit.

**Trade-off:** The application owns orchestration code that a higher-level agent framework could provide.

**Revisit when:** The project needs handoffs, reusable agent primitives, hosted tracing, or a larger multi-agent workflow.

Reference: [OpenAI function calling guide](https://developers.openai.com/api/docs/guides/function-calling).

## 2. Fastify backend separate from Next.js

**Decision:** Keep the agent runtime and tools in a dedicated Fastify application while Next.js owns the UI.

**Why:** Tool execution, API credentials, operational data, and confirmation state remain on the server. The boundary also demonstrates a reusable agent API that is not coupled to one frontend framework.

**Trade-off:** Local development runs two processes and requires CORS configuration.

**Revisit when:** The application becomes a small single-deployment product where Next.js route handlers would materially simplify operations.

## 3. npm workspaces instead of a larger monorepo framework

**Decision:** Use native npm workspaces for `apps/api` and `apps/web`.

**Why:** Two applications need shared root commands, but the project does not yet need task graphs, remote caching, package generators, or publishable internal packages.

**Trade-off:** Build orchestration and caching remain basic.

**Revisit when:** More applications or shared packages make dependency-aware builds valuable.

## 4. TypeScript plus strict Zod tool schemas

**Decision:** Define each tool with a Zod schema and generate its OpenAI function definition from that schema.

**Why:** TypeScript protects application code at compile time but cannot validate JSON produced at runtime. Zod provides one source for inferred argument types, JSON Schema generation, strict function definitions, and validation before execution. Invalid tool arguments become structured tool errors instead of unchecked calls.

**Trade-off:** Tool schemas must stay within the JSON Schema features supported by strict function calling.

The OpenAI documentation recommends strict mode so function calls reliably follow their schema; it requires required properties and `additionalProperties: false`. See [Strict mode](https://developers.openai.com/api/docs/guides/function-calling#strict-mode).

## 5. Manual response history with `store: false`

**Decision:** Set `store: false` and manually keep the user input, every response output item, and each `function_call_output` in the next request.

**Why:** This makes conversation state visible to the application and avoids relying on server-side response storage. Replaying the complete output is important because a response can contain more than the function call itself.

**Trade-off:** Input grows with every tool round, and the application must preserve the correct `call_id` relationship.

**Revisit when:** Longer conversations require persisted sessions, compaction, or `previous_response_id`-based continuation.

This follows the manual-history guidance in [OpenAI model guidance](https://developers.openai.com/api/docs/guides/latest-model) and the `function_call_output` flow in the [function calling guide](https://developers.openai.com/api/docs/guides/function-calling).

## 6. Sequential and bounded tool execution

**Decision:** Set `parallel_tool_calls: false` and limit a run to eight model/tool rounds.

**Why:** The agent's next decision often depends on the previous result. Sequential execution produces a deterministic trace and avoids ambiguous cases such as several simultaneous dangerous actions. The round limit prevents a faulty model/tool loop from running indefinitely.

**Trade-off:** Independent read-only tools cannot run concurrently, so some investigations may take longer.

**Revisit when:** Latency measurements justify parallel read tools and the application has an explicit policy for multiple calls and confirmations.

## 7. Tool results are structured values

**Decision:** Return `{ ok: true, data }` or `{ ok: false, error }` to the model instead of allowing expected tool failures to escape the loop as exceptions.

**Why:** The model needs to know whether a tool failed so it can explain the result or choose another step. Stable error codes are also easier to test and display in Agent Trace.

**Trade-off:** Application bugs and expected operational failures must be classified carefully so serious problems are not accidentally reduced to normal tool output.

## 8. Confirmation is enforced by the backend

**Decision:** Mark `retry_payment` with a confirmation policy in the tool registry. The first invocation returns `requiresConfirmation` without calling the executor.

**Why:** Prompt instructions and UI controls are not security boundaries. The backend pauses the run, issues an opaque confirmation identifier, and executes only after an explicit approval request. It revalidates payment state at execution time, so the original model request is not blindly trusted.

This also keeps approval as a direct tool-call boundary, which is the recommended shape when an action requires approval in [OpenAI model guidance](https://developers.openai.com/api/docs/guides/latest-model#programmatic-tool-calling).

Confirmations expire after 10 minutes and are deleted before execution, making them single-use even if execution fails. Cancellation is returned to the model as a normal structured tool result so the final answer reflects the user's decision.

**Trade-off:** If a confirmation response is lost after execution, the same identifier cannot be replayed. A production implementation would expose durable operation status or an idempotency key.

**Related choice:** `create_incident_note` is currently treated as a low-impact local write and does not show a confirmation dialog. The prompt and tool description require an explicit user request. If notes are later sent to an external incident system, this must become a hard authorization or confirmation policy.

## 9. In-memory operational data and pending runs

**Decision:** Keep fixtures, incident notes, payment state, and pending confirmations in process memory.

**Why:** The MVP focuses on agent orchestration rather than database setup. Deterministic fixtures make demonstrations and scenario tests fast and repeatable.

**Trade-off:** State disappears on restart, cannot be shared by multiple API instances, and is not suitable for real operations.

**Revisit when:** Authentication, multiple users, horizontal scaling, durable incidents, or real payment integrations are introduced.

## 10. Agent Trace is a first-class result

**Decision:** Build trace steps during the backend run and return them alongside the answer or pending confirmation.

**Why:** Trace data represents what the application actually observed: user input, model rounds, tool calls, results, decisions, and final output. Generating it in the backend avoids reconstructing execution from UI assumptions.

The frontend stores only the latest trace in `sessionStorage`. This keeps navigation to `/trace` simple without presenting browser storage as durable observability.

**Trade-off:** Trace history is limited to the current browser tab and can contain operational details. A production system would require server-side storage, retention rules, redaction, and access control.

## 11. Custom `AgentApiError` class

**Decision:** Represent failed frontend API requests with an `Error` subclass carrying HTTP `status` and application `code`.

**Why:** Callers retain normal error semantics, stack information, and message handling while being able to use `instanceof AgentApiError` and distinguish an expired confirmation (`404`) from a generic network or runtime failure.

**Trade-off:** The client uses exceptions rather than a `Result<T, E>` return type. A result type could be preferable if error handling becomes a dominant part of the UI flow.

## 12. Native Node.js test runner

**Decision:** Use `node:test` and `node:assert/strict`, with `tsx` loading TypeScript tests.

**Why:** The backend already used the native runner, it needs no additional test framework, and it covers the current unit, integration, and deterministic agent scenarios well. Consistency was more valuable than introducing Vitest or Jest for one stage.

**Trade-off:** Mocking, watch UX, coverage integrations, and React component testing are less convenient than in Vitest.

**Revisit when:** Frontend component tests are added. At that point, Vitest plus React Testing Library would be a reasonable shared test stack.

## 13. Non-streaming responses for the MVP

**Decision:** Wait for each Responses API request to complete instead of streaming partial model output to the browser.

**Why:** Tool calls, confirmation pauses, final answers, and trace updates are easier to reason about as complete state transitions. The UI still provides an explicit running state.

**Trade-off:** Users do not see partial output, and long investigations can feel less responsive.

**Revisit when:** Real latency becomes a product concern and the API contract can represent incremental trace and message events.

## 14. MCP remains an adapter, not the MVP foundation

**Decision:** Register local tools directly. Do not make MCP a dependency of the main flow.

**Why:** Direct tools keep the portfolio project focused on the essential behavior: schemas, execution, confirmation, continuation, and trace. The registry already provides a natural boundary for adding tools from another source later.

**Trade-off:** The current implementation does not demonstrate external MCP discovery or transport.

**Revisit when:** A real external system should expose the same capability to several agents or clients.

## Current MVP boundaries

The code review confirmed that the implementation is coherent for a local demonstration, but these constraints are intentional and should remain visible:

- no authentication, authorization, tenancy, rate limiting, or production secret management
- no durable database, distributed confirmation store, or multi-instance coordination
- no real service monitoring, payment provider, incident platform, or idempotency integration
- no streaming model output
- shallow runtime validation of API responses in the frontend; the client currently trusts the backend contract after JSON parsing
- the latest Agent Trace is browser-tab state, not an observability system
- operational tool results may contain data that would require redaction in production

These are extension points rather than hidden production-ready claims.
