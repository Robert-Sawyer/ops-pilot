import { zodResponsesFunction } from "openai/helpers/zod";
import type { FunctionTool } from "openai/resources/responses/responses";
import { z } from "zod";

export interface ToolError {
  code:
    | "unknown_tool"
    | "invalid_arguments"
    | "execution_failed"
    | "cancelled_by_user";
  message: string;
}

export type ToolExecutionResult =
  | { ok: true; data: unknown }
  | { ok: false; error: ToolError };

export interface ToolConfirmationRequired {
  requiresConfirmation: true;
  toolName: string;
  arguments: unknown;
  title: string;
  description: string;
}

export type ToolInvocationResult =
  | ToolExecutionResult
  | ToolConfirmationRequired;

export interface ToolExecutionOptions {
  confirmed?: boolean;
}

interface ToolConfirmationPolicy<TArguments> {
  title: string;
  describe: (arguments_: TArguments) => string;
}

interface RegisteredTool<TSchema extends z.ZodType> {
  definition: FunctionTool;
  parameters: TSchema;
  execute: (arguments_: z.infer<TSchema>) => unknown | Promise<unknown>;
  confirmation?: ToolConfirmationPolicy<z.infer<TSchema>>;
}

type AnyRegisteredTool = RegisteredTool<z.ZodType>;

export interface ToolRegistry {
  definitions: FunctionTool[];
  execute(
    name: string,
    rawArguments: string,
    options?: ToolExecutionOptions,
  ): Promise<ToolInvocationResult>;
}

export interface DefineToolOptions<TSchema extends z.ZodType> {
  name: string;
  description: string;
  parameters: TSchema;
  execute: (arguments_: z.infer<TSchema>) => unknown | Promise<unknown>;
  confirmation?: ToolConfirmationPolicy<z.infer<TSchema>>;
}

export function defineTool<TSchema extends z.ZodType>(
  options: DefineToolOptions<TSchema>,
): RegisteredTool<TSchema> {
  return {
    definition: zodResponsesFunction({
      name: options.name,
      description: options.description,
      parameters: options.parameters,
    }),
    parameters: options.parameters,
    execute: options.execute,
    confirmation: options.confirmation,
  };
}

const invalidArguments = (message: string): ToolExecutionResult => ({
  ok: false,
  error: { code: "invalid_arguments", message },
});

export function createToolRegistry(tools: AnyRegisteredTool[]): ToolRegistry {
  const toolsByName = new Map(tools.map((tool) => [tool.definition.name, tool]));

  return {
    definitions: tools.map((tool) => tool.definition),

    async execute(name, rawArguments, options = {}) {
      const tool = toolsByName.get(name);
      if (!tool) {
        return {
          ok: false,
          error: {
            code: "unknown_tool",
            message: `Tool '${name}' is not registered.`,
          },
        };
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(rawArguments);
      } catch {
        return invalidArguments("Tool arguments must be valid JSON.");
      }

      const parsedArguments = tool.parameters.safeParse(parsedJson);
      if (!parsedArguments.success) {
        return invalidArguments(
          z.prettifyError(parsedArguments.error).replaceAll("\n", " "),
        );
      }

      if (tool.confirmation && !options.confirmed) {
        return {
          requiresConfirmation: true,
          toolName: tool.definition.name,
          arguments: parsedArguments.data,
          title: tool.confirmation.title,
          description: tool.confirmation.describe(parsedArguments.data),
        };
      }

      try {
        return { ok: true, data: await tool.execute(parsedArguments.data) };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: "execution_failed",
            message:
              error instanceof Error ? error.message : "Tool execution failed.",
          },
        };
      }
    },
  };
}

export function isToolConfirmationRequired(
  result: ToolInvocationResult,
): result is ToolConfirmationRequired {
  return "requiresConfirmation" in result && result.requiresConfirmation;
}
