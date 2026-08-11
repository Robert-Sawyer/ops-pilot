import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  Response,
  ResponseCreateParamsNonStreaming,
  ResponseOutputItem,
} from "openai/resources/responses/responses";

import { createLocalDataStore, createOperationalDataSeed } from "../data/index.js";
import { createOperationalToolRegistry } from "../tools/index.js";
import {
  createOpenAIAgentRunner,
  type ResponsesGateway,
} from "./openai-agent-runner.js";
import type { AgentTraceStep } from "./types.js";

const now = new Date("2026-08-11T10:00:00.000Z");

const functionCall = (
  callId: string,
  name: string,
  arguments_: Record<string, unknown>,
): ResponseOutputItem => ({
  type: "function_call",
  id: `fc_${callId}`,
  call_id: callId,
  name,
  arguments: JSON.stringify(arguments_),
  status: "completed",
});

const modelResponse = (
  id: string,
  output: ResponseOutputItem[],
  outputText = "",
) =>
  ({
    id,
    output,
    output_text: outputText,
    error: null,
  }) as Response;

const createScenarioHarness = (
  scriptedResponses: Response[],
  confirmationId = "scenario_confirmation",
) => {
  const requests: ResponseCreateParamsNonStreaming[] = [];
  const responses = [...scriptedResponses];
  const gateway: ResponsesGateway = {
    async create(parameters) {
      requests.push(structuredClone(parameters));
      const response = responses.shift();
      assert.ok(response, "The scenario made more model requests than expected.");
      return response;
    },
  };
  const dataStore = createLocalDataStore(createOperationalDataSeed(now));
  const tools = createOperationalToolRegistry({ dataStore, now: () => now });
  const runner = createOpenAIAgentRunner({
    responses: gateway,
    tools,
    model: "scenario-model",
    now: () => now,
    createConfirmationId: () => confirmationId,
  });

  return {
    dataStore,
    requests,
    runner,
    assertScriptConsumed() {
      assert.equal(responses.length, 0, "The scenario did not use every scripted response.");
    },
  };
};

const readFunctionOutput = (
  request: ResponseCreateParamsNonStreaming,
  callId: string,
): Record<string, unknown> => {
  assert.ok(Array.isArray(request.input), "Expected manually managed response input.");
  const output = request.input.find(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      "type" in item &&
      item.type === "function_call_output" &&
      "call_id" in item &&
      item.call_id === callId,
  );

  assert.ok(output, `Missing function_call_output for '${callId}'.`);
  assert.ok(
    "output" in output && typeof output.output === "string",
    `Expected a JSON string result for '${callId}'.`,
  );
  return JSON.parse(output.output) as Record<string, unknown>;
};

const successfulOutputData = (
  request: ResponseCreateParamsNonStreaming,
  callId: string,
): Record<string, unknown> => {
  const result = readFunctionOutput(request, callId);
  assert.equal(result.ok, true, `Expected '${callId}' to succeed.`);
  assert.equal(typeof result.data, "object");
  assert.notEqual(result.data, null);
  return result.data as Record<string, unknown>;
};

const traceToolNames = (trace: AgentTraceStep[]) =>
  trace
    .filter((step) => step.type === "tool_call")
    .map((step) => step.name);

describe("agent scenarios", () => {
  it("investigates payment failures using health, errors, and runbook evidence", async () => {
    const scenario = createScenarioHarness([
      modelResponse("investigation_1", [
        functionCall("health", "get_service_health", {
          service: "payments-api",
        }),
      ]),
      modelResponse("investigation_2", [
        functionCall("errors", "get_recent_errors", {
          service: "payments-api",
        }),
      ]),
      modelResponse("investigation_3", [
        functionCall("runbook", "search_runbook", {
          query: "payment gateway timeout",
        }),
      ]),
      modelResponse(
        "investigation_4",
        [],
        "Payments API is healthy, but 17 requests failed with gateway timeouts in the last 10 minutes. Check provider availability before retrying.",
      ),
    ]);

    const result = await scenario.runner.run(
      "Payments are failing. Can you investigate?",
    );

    assert.equal(result.status, "completed");
    assert.match(result.status === "completed" ? result.answer : "", /17 requests/);
    assert.deepEqual(traceToolNames(result.trace), [
      "get_service_health",
      "get_recent_errors",
      "search_runbook",
    ]);

    const finalRequest = scenario.requests.at(-1);
    assert.ok(finalRequest);
    assert.equal(successfulOutputData(finalRequest, "health").status, "healthy");
    assert.equal(successfulOutputData(finalRequest, "errors").totalOccurrences, 17);
    const runbookData = successfulOutputData(finalRequest, "runbook");
    assert.equal(runbookData.resultCount, 3);
    assert.match(JSON.stringify(runbookData), /Check provider availability/);
    scenario.assertScriptConsumed();
  });

  it("creates an incident note from investigated payment evidence", async () => {
    const noteTitle = "Payment gateway timeouts";
    const noteContent =
      "payments-api is healthy, with 17 PAYMENT_GATEWAY_TIMEOUT failures in the last 10 minutes.";
    const scenario = createScenarioHarness([
      modelResponse("note_1", [
        functionCall("note_health", "get_service_health", {
          service: "payments-api",
        }),
      ]),
      modelResponse("note_2", [
        functionCall("note_errors", "get_recent_errors", {
          service: "payments-api",
        }),
      ]),
      modelResponse("note_3", [
        functionCall("create_note", "create_incident_note", {
          service: "payments-api",
          title: noteTitle,
          content: noteContent,
        }),
      ]),
      modelResponse(
        "note_4",
        [],
        "Incident note incident_note_1 was created for payments-api.",
      ),
    ]);

    const result = await scenario.runner.run(
      "Investigate the payment errors and create an incident note.",
    );

    assert.equal(result.status, "completed");
    assert.deepEqual(traceToolNames(result.trace), [
      "get_service_health",
      "get_recent_errors",
      "create_incident_note",
    ]);
    assert.deepEqual(scenario.dataStore.listIncidentNotes(), [
      {
        id: "incident_note_1",
        service: "payments-api",
        title: noteTitle,
        content: noteContent,
        createdAt: now.toISOString(),
      },
    ]);

    const finalRequest = scenario.requests.at(-1);
    assert.ok(finalRequest);
    const noteResult = successfulOutputData(finalRequest, "create_note");
    assert.equal(noteResult.id, "incident_note_1");
    assert.equal(noteResult.createdAt, now.toISOString());
    scenario.assertScriptConsumed();
  });

  it("keeps a failed payment unchanged when the user cancels the retry", async () => {
    const scenario = createScenarioHarness(
      [
        modelResponse("cancel_1", [
          functionCall("cancel_payment", "get_payment", {
            paymentId: "payment_123",
          }),
        ]),
        modelResponse("cancel_2", [
          functionCall("cancel_retry", "retry_payment", {
            paymentId: "payment_123",
          }),
        ]),
        modelResponse("cancel_3", [], "The payment retry was cancelled."),
      ],
      "cancel_confirmation",
    );

    const pending = await scenario.runner.run("Retry payment_123.");

    assert.equal(pending.status, "requires_confirmation");
    assert.equal(scenario.dataStore.getPayment("payment_123")?.status, "failed");
    assert.deepEqual(traceToolNames(pending.trace), ["get_payment", "retry_payment"]);
    assert.match(
      pending.status === "requires_confirmation"
        ? pending.confirmation.description
        : "",
      /USD 129\.99/,
    );

    const completed = await scenario.runner.resolveConfirmation(
      "cancel_confirmation",
      false,
    );

    assert.equal(completed.status, "completed");
    const unchangedPayment = scenario.dataStore.getPayment("payment_123");
    assert.equal(unchangedPayment?.status, "failed");
    assert.equal(unchangedPayment?.failureCode, "PAYMENT_GATEWAY_TIMEOUT");
    const finalRequest = scenario.requests.at(-1);
    assert.ok(finalRequest);
    assert.deepEqual(readFunctionOutput(finalRequest, "cancel_retry"), {
      ok: false,
      error: {
        code: "cancelled_by_user",
        message: "The user cancelled this tool execution.",
      },
    });
    assert.equal(
      completed.trace.some(
        (step) => step.type === "confirmation_resolved" && !step.approved,
      ),
      true,
    );
    scenario.assertScriptConsumed();
  });

  it("retries a failed payment only after explicit confirmation", async () => {
    const scenario = createScenarioHarness(
      [
        modelResponse("confirm_1", [
          functionCall("confirm_payment", "get_payment", {
            paymentId: "payment_123",
          }),
        ]),
        modelResponse("confirm_2", [
          functionCall("confirm_retry", "retry_payment", {
            paymentId: "payment_123",
          }),
        ]),
        modelResponse(
          "confirm_3",
          [],
          "The retry was queued and payment_123 is now processing.",
        ),
      ],
      "approve_confirmation",
    );

    const pending = await scenario.runner.run("Retry payment_123.");

    assert.equal(pending.status, "requires_confirmation");
    assert.equal(scenario.dataStore.getPayment("payment_123")?.status, "failed");
    assert.equal(scenario.requests.length, 2);

    const completed = await scenario.runner.resolveConfirmation(
      "approve_confirmation",
      true,
    );

    assert.equal(completed.status, "completed");
    assert.match(
      completed.status === "completed" ? completed.answer : "",
      /now processing/,
    );
    assert.deepEqual(scenario.dataStore.getPayment("payment_123"), {
      id: "payment_123",
      customerId: "customer_201",
      amount: 129.99,
      currency: "USD",
      status: "processing",
      provider: "acme-pay",
      createdAt: "2026-08-11T09:52:00.000Z",
      updatedAt: now.toISOString(),
    });

    const finalRequest = scenario.requests.at(-1);
    assert.ok(finalRequest);
    const retryResult = successfulOutputData(finalRequest, "confirm_retry");
    assert.equal(retryResult.action, "retry_queued");
    assert.equal(
      completed.trace.some(
        (step) => step.type === "confirmation_resolved" && step.approved,
      ),
      true,
    );
    scenario.assertScriptConsumed();
  });
});
