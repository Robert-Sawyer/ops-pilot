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
      type: "confirmation_required";
      confirmationId: string;
      callId: string;
      name: string;
    }
  | {
      type: "confirmation_resolved";
      confirmationId: string;
      approved: boolean;
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

export interface PendingConfirmation {
  id: string;
  toolName: string;
  arguments: unknown;
  title: string;
  description: string;
  expiresAt: string;
}

export interface AgentCompletedResult {
  status: "completed";
  requiresConfirmation: false;
  answer: string;
  trace: AgentTraceStep[];
}

export interface AgentConfirmationRequiredResult {
  status: "requires_confirmation";
  requiresConfirmation: true;
  confirmation: PendingConfirmation;
  trace: AgentTraceStep[];
}

export type AgentRunResult =
  | AgentCompletedResult
  | AgentConfirmationRequiredResult;

export interface AgentRunner {
  run(message: string): Promise<AgentRunResult>;
  resolveConfirmation(
    confirmationId: string,
    approved: boolean,
  ): Promise<AgentRunResult>;
}
