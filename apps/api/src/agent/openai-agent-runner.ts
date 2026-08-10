import { randomUUID } from "node:crypto";
import type {
  Response,
  ResponseCreateParamsNonStreaming,
  ResponseFunctionToolCall,
  ResponseInput,
} from "openai/resources/responses/responses";

import {
  isToolConfirmationRequired,
  type ToolExecutionResult,
  type ToolRegistry,
} from "../tools/index.js";
import type {
  AgentRunResult,
  AgentRunner,
  AgentTraceStep,
} from "./types.js";

export interface ResponsesGateway {
  create(parameters: ResponseCreateParamsNonStreaming): Promise<Response>;
}

export interface OpenAIAgentRunnerOptions {
  responses: ResponsesGateway;
  tools: ToolRegistry;
  model: string;
  maxToolRounds?: number;
  instructions?: string;
  confirmationTtlMs?: number;
  now?: () => Date;
  createConfirmationId?: () => string;
}

export const defaultAgentInstructions = `You are Ops Pilot, a developer operations investigation agent.
Use the provided tools as the source of truth for operational facts. Do not invent service state, errors, runbook guidance, payment status, or completed actions.
When investigating an issue, gather the evidence needed to answer it and explain the findings concisely.
Create an incident note only when the user explicitly asks you to record or document the investigation.
Request retry_payment only when the user explicitly asks to retry a specific payment. Inspect the payment first. The application will pause for confirmation; never assume approval and never claim a retry succeeded until the tool result confirms execution.`;

export class AgentRunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentRunError";
  }
}

export class AgentConfirmationNotFoundError extends AgentRunError {
  constructor() {
    super("The pending confirmation was not found or has expired.");
    this.name = "AgentConfirmationNotFoundError";
  }
}

interface PendingRun {
  input: ResponseInput;
  trace: AgentTraceStep[];
  toolCall: ResponseFunctionToolCall;
  nextRound: number;
  expiresAtMs: number;
}

const parseArgumentsForTrace = (rawArguments: string): unknown => {
  try {
    return JSON.parse(rawArguments);
  } catch {
    return rawArguments;
  }
};

export function createOpenAIAgentRunner({
  responses,
  tools,
  model,
  maxToolRounds = 8,
  instructions = defaultAgentInstructions,
  confirmationTtlMs = 10 * 60_000,
  now = () => new Date(),
  createConfirmationId = randomUUID,
}: OpenAIAgentRunnerOptions): AgentRunner {
  const pendingRuns = new Map<string, PendingRun>();

  const purgeExpiredConfirmations = () => {
    const currentTime = now().getTime();
    for (const [confirmationId, pendingRun] of pendingRuns) {
      if (pendingRun.expiresAtMs <= currentTime) {
        pendingRuns.delete(confirmationId);
      }
    }
  };

  const appendToolResult = (
    input: ResponseInput,
    trace: AgentTraceStep[],
    toolCall: ResponseFunctionToolCall,
    result: ToolExecutionResult,
  ) => {
    trace.push({
      type: "tool_result",
      callId: toolCall.call_id,
      name: toolCall.name,
      result,
    });
    input.push({
      type: "function_call_output",
      call_id: toolCall.call_id,
      output: JSON.stringify(result),
    });
  };

  const continueRun = async (
    input: ResponseInput,
    trace: AgentTraceStep[],
    startingRound: number,
  ): Promise<AgentRunResult> => {
    for (let round = startingRound; round <= maxToolRounds; round += 1) {
      const response = await responses.create({
        model,
        instructions,
        input,
        tools: tools.definitions,
        tool_choice: "auto",
        parallel_tool_calls: false,
        store: false,
      });

      if (response.error) {
        throw new AgentRunError(`OpenAI response failed: ${response.error.message}`);
      }

      trace.push({ type: "model_response", responseId: response.id, round });
      // Responses output must be replayed when store is disabled. The SDK models
      // some hosted-tool output variants more broadly than the input union.
      input.push(...(response.output as ResponseInput));

      const toolCalls = response.output.filter(
        (item) => item.type === "function_call",
      );

      if (toolCalls.length === 0) {
        const answer = response.output_text.trim();
        if (!answer) {
          throw new AgentRunError(
            "The model returned neither a tool call nor a final answer.",
          );
        }

        trace.push({ type: "final_answer", content: answer });
        return {
          status: "completed",
          requiresConfirmation: false,
          answer,
          trace,
        };
      }

      if (toolCalls.length > 1) {
        throw new AgentRunError(
          "The model returned multiple tool calls although parallel calls are disabled.",
        );
      }

      const toolCall = toolCalls[0];
      if (!toolCall) {
        throw new AgentRunError("The model returned an invalid tool call.");
      }

      trace.push({
        type: "tool_call",
        callId: toolCall.call_id,
        name: toolCall.name,
        arguments: parseArgumentsForTrace(toolCall.arguments),
      });

      const invocation = await tools.execute(toolCall.name, toolCall.arguments);

      if (isToolConfirmationRequired(invocation)) {
        purgeExpiredConfirmations();
        const confirmationId = createConfirmationId();
        const expiresAtMs = now().getTime() + confirmationTtlMs;
        pendingRuns.set(confirmationId, {
          input,
          trace,
          toolCall,
          nextRound: round + 1,
          expiresAtMs,
        });
        trace.push({
          type: "confirmation_required",
          confirmationId,
          callId: toolCall.call_id,
          name: toolCall.name,
        });

        return {
          status: "requires_confirmation",
          requiresConfirmation: true,
          confirmation: {
            id: confirmationId,
            toolName: invocation.toolName,
            arguments: invocation.arguments,
            title: invocation.title,
            description: invocation.description,
            expiresAt: new Date(expiresAtMs).toISOString(),
          },
          trace,
        };
      }

      appendToolResult(input, trace, toolCall, invocation);
    }

    throw new AgentRunError(
      `The agent exceeded the limit of ${maxToolRounds} tool rounds.`,
    );
  };

  return {
    run(message) {
      return continueRun(
        [{ role: "user", content: message }],
        [{ type: "user_message", content: message }],
        1,
      );
    },

    async resolveConfirmation(confirmationId, approved) {
      purgeExpiredConfirmations();
      const pendingRun = pendingRuns.get(confirmationId);
      if (!pendingRun) {
        throw new AgentConfirmationNotFoundError();
      }

      // Confirmations are single-use, including failed executions.
      pendingRuns.delete(confirmationId);
      pendingRun.trace.push({
        type: "confirmation_resolved",
        confirmationId,
        approved,
      });

      let result: ToolExecutionResult;
      if (approved) {
        const invocation = await tools.execute(
          pendingRun.toolCall.name,
          pendingRun.toolCall.arguments,
          { confirmed: true },
        );
        if (isToolConfirmationRequired(invocation)) {
          throw new AgentRunError(
            "The confirmed tool unexpectedly requested confirmation again.",
          );
        }
        result = invocation;
      } else {
        result = {
          ok: false,
          error: {
            code: "cancelled_by_user",
            message: "The user cancelled this tool execution.",
          },
        };
      }

      appendToolResult(
        pendingRun.input,
        pendingRun.trace,
        pendingRun.toolCall,
        result,
      );

      return continueRun(
        pendingRun.input,
        pendingRun.trace,
        pendingRun.nextRound,
      );
    },
  };
}
