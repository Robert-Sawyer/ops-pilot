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
  AgentRunError,
  createOpenAIAgentRunner,
  type ResponsesGateway,
} from "./openai-agent-runner.js";

const now = new Date("2026-08-10T10:00:00.000Z");

const functionCall = (
  callId: string,
  name: string,
  arguments_: Record<string, string>,
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

const createMockGateway = (queuedResponses: Response[]) => {
  const inputs: ResponseCreateParamsNonStreaming["input"][] = [];
  const requests: ResponseCreateParamsNonStreaming[] = [];

  const gateway: ResponsesGateway = {
    async create(parameters) {
      requests.push(parameters);
      inputs.push(structuredClone(parameters.input));
      const response = queuedResponses.shift();
      assert.ok(response, "The model received more requests than expected.");
      return response;
    },
  };

  return { gateway, inputs, requests };
};

const createTools = () => {
  const dataStore = createLocalDataStore(createOperationalDataSeed(now));
  return createOperationalToolRegistry({ dataStore, now: () => now });
};

describe("OpenAI agent runner", () => {
  it("runs a multi-step tool-calling loop and returns an auditable trace", async () => {
    const { gateway, inputs, requests } = createMockGateway([
      modelResponse("response_1", [
        functionCall("call_1", "get_service_health", {
          service: "payments-api",
        }),
      ]),
      modelResponse("response_2", [
        functionCall("call_2", "get_recent_errors", {
          service: "payments-api",
        }),
      ]),
      modelResponse("response_3", [
        functionCall("call_3", "search_runbook", {
          query: "payment gateway timeout",
        }),
      ]),
      modelResponse(
        "response_4",
        [],
        "Payments API is healthy, but 17 gateway timeouts occurred in the last 10 minutes.",
      ),
    ]);
    const runner = createOpenAIAgentRunner({
      responses: gateway,
      tools: createTools(),
      model: "test-model",
    });

    const result = await runner.run("Payments are failing. Can you investigate?");

    assert.equal(requests.length, 4);
    assert.ok(requests.every(({ parallel_tool_calls }) => parallel_tool_calls === false));
    assert.ok(requests.every(({ store }) => store === false));
    assert.equal(result.answer.includes("17 gateway timeouts"), true);
    assert.deepEqual(
      result.trace.map(({ type }) => type),
      [
        "user_message",
        "model_response",
        "tool_call",
        "tool_result",
        "model_response",
        "tool_call",
        "tool_result",
        "model_response",
        "tool_call",
        "tool_result",
        "model_response",
        "final_answer",
      ],
    );

    const secondRoundInput = inputs[1];
    assert.ok(Array.isArray(secondRoundInput));
    assert.ok(
      secondRoundInput.some(
        (item) =>
          typeof item === "object" &&
          item !== null &&
          "type" in item &&
          item.type === "function_call_output" &&
          "call_id" in item &&
          item.call_id === "call_1",
      ),
    );
  });

  it("stops runaway tool calling after the configured limit", async () => {
    const { gateway } = createMockGateway([
      modelResponse("response_1", [
        functionCall("call_1", "get_service_health", {
          service: "payments-api",
        }),
      ]),
    ]);
    const runner = createOpenAIAgentRunner({
      responses: gateway,
      tools: createTools(),
      model: "test-model",
      maxToolRounds: 1,
    });

    await assert.rejects(
      runner.run("Keep checking forever."),
      (error: unknown) =>
        error instanceof AgentRunError && error.message.includes("limit of 1"),
    );
  });
});
