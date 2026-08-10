import type {
  Response,
  ResponseCreateParamsNonStreaming,
  ResponseInput,
} from "openai/resources/responses/responses";

import type { ToolRegistry } from "../tools/index.js";
import type { AgentRunResult, AgentRunner, AgentTraceStep } from "./types.js";

export interface ResponsesGateway {
  create(parameters: ResponseCreateParamsNonStreaming): Promise<Response>;
}

export interface OpenAIAgentRunnerOptions {
  responses: ResponsesGateway;
  tools: ToolRegistry;
  model: string;
  maxToolRounds?: number;
  instructions?: string;
}

export const defaultAgentInstructions = `You are Ops Pilot, a developer operations investigation agent.
Use the provided tools as the source of truth for operational facts. Do not invent service state, errors, runbook guidance, payment status, or completed actions.
When investigating an issue, gather the evidence needed to answer it and explain the findings concisely.
Create an incident note only when the user explicitly asks you to record or document the investigation.
You cannot retry payments or perform other dangerous actions. Never claim that you executed an unavailable action.`;

export class AgentRunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentRunError";
  }
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
}: OpenAIAgentRunnerOptions): AgentRunner {
  return {
    async run(message): Promise<AgentRunResult> {
      const input: ResponseInput = [{ role: "user", content: message }];
      const trace: AgentTraceStep[] = [
        { type: "user_message", content: message },
      ];

      for (let round = 1; round <= maxToolRounds; round += 1) {
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
        // The Responses API requires its output items to be preserved as the next
        // input. The SDK currently models a few hosted-tool output variants more
        // broadly than the corresponding input union.
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
          return { answer, trace };
        }

        for (const toolCall of toolCalls) {
          trace.push({
            type: "tool_call",
            callId: toolCall.call_id,
            name: toolCall.name,
            arguments: parseArgumentsForTrace(toolCall.arguments),
          });

          const result = await tools.execute(toolCall.name, toolCall.arguments);

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
        }
      }

      throw new AgentRunError(
        `The agent exceeded the limit of ${maxToolRounds} tool rounds.`,
      );
    },
  };
}
