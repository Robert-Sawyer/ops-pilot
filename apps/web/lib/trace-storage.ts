import type { AgentTraceStep } from "./agent-api";

const traceStorageKey = "ops-pilot:last-agent-trace";

const traceStepTypes = new Set<AgentTraceStep["type"]>([
  "user_message",
  "model_response",
  "tool_call",
  "confirmation_required",
  "confirmation_resolved",
  "tool_result",
  "final_answer",
]);

export interface StoredAgentTrace {
  trace: AgentTraceStep[];
  capturedAt: string;
}

const isAgentTraceStep = (value: unknown): value is AgentTraceStep => {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false;
  }

  return (
    typeof value.type === "string" &&
    traceStepTypes.has(value.type as AgentTraceStep["type"])
  );
};

export function storeAgentTrace(trace: AgentTraceStep[]) {
  if (typeof window === "undefined" || trace.length === 0) return;

  const snapshot: StoredAgentTrace = {
    trace,
    capturedAt: new Date().toISOString(),
  };
  try {
    window.sessionStorage.setItem(traceStorageKey, JSON.stringify(snapshot));
  } catch {
    // Storage can be unavailable in restricted browser contexts. The live
    // trace remains usable in Chat even when persistence is blocked.
  }
}

export function readStoredAgentTrace(): StoredAgentTrace | null {
  if (typeof window === "undefined") return null;

  const serializedTrace = window.sessionStorage.getItem(traceStorageKey);
  if (!serializedTrace) return null;

  try {
    const candidate = JSON.parse(serializedTrace) as Partial<StoredAgentTrace>;
    if (
      typeof candidate.capturedAt !== "string" ||
      !Array.isArray(candidate.trace) ||
      !candidate.trace.every(isAgentTraceStep)
    ) {
      return null;
    }

    return {
      capturedAt: candidate.capturedAt,
      trace: candidate.trace,
    };
  } catch {
    return null;
  }
}
