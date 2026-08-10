export type AgentTraceStep =
  | {
      type: "user_message";
      content: string;
    }
  | {
      type: "model_response";
      responseId: string;
      round: number;
    }
  | {
      type: "tool_call";
      callId: string;
      name: string;
      arguments: unknown;
    }
  | {
      type: "tool_result";
      callId: string;
      name: string;
      result: unknown;
    }
  | {
      type: "final_answer";
      content: string;
    };

export interface AgentRunResult {
  answer: string;
  trace: AgentTraceStep[];
}

export interface AgentRunner {
  run(message: string): Promise<AgentRunResult>;
}
