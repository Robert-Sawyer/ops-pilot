export type AgentTraceStep =
  | { type: "user_message"; content: string }
  | { type: "model_response"; responseId: string; round: number }
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
  | { type: "final_answer"; content: string };

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

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
}

export class AgentApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "AgentApiError";
  }
}

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const body = (await response.json()) as T & ApiErrorBody;

  if (!response.ok) {
    throw new AgentApiError(
      body.error?.message ?? `The API returned HTTP ${response.status}.`,
      response.status,
      body.error?.code,
    );
  }

  return body;
}

export function runAgent(message: string) {
  return postJson<AgentRunResult>("/api/agent/run", { message });
}

export function resolveAgentConfirmation(
  confirmationId: string,
  approved: boolean,
) {
  return postJson<AgentRunResult>("/api/agent/confirm", {
    confirmationId,
    approved,
  });
}
