"use client";

import { useMemo, useState } from "react";

import type { AgentTraceStep } from "../../lib/agent-api";

interface TracePanelProps {
  trace: AgentTraceStep[];
  isRunning: boolean;
  variant?: "panel" | "screen";
  capturedAt?: string;
}

type TraceFilter = "all" | "messages" | "tools" | "decisions";

const labels: Record<AgentTraceStep["type"], string> = {
  user_message: "User message",
  model_response: "Model round",
  tool_call: "Tool call",
  confirmation_required: "Approval required",
  confirmation_resolved: "User decision",
  tool_result: "Tool result",
  final_answer: "Final answer",
};

const filterTypes: Record<TraceFilter, AgentTraceStep["type"][]> = {
  all: [
    "user_message",
    "model_response",
    "tool_call",
    "confirmation_required",
    "confirmation_resolved",
    "tool_result",
    "final_answer",
  ],
  messages: ["user_message", "final_answer"],
  tools: ["tool_call", "tool_result"],
  decisions: [
    "model_response",
    "confirmation_required",
    "confirmation_resolved",
  ],
};

const formatJson = (value: unknown) => JSON.stringify(value, null, 2);

const formatCapturedAt = (capturedAt?: string) => {
  if (!capturedAt) return null;

  const date = new Date(capturedAt);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
};

const getResultStatus = (result: unknown) => {
  if (typeof result !== "object" || result === null || !("ok" in result)) {
    return null;
  }

  return result.ok === true ? "success" : "error";
};

function TraceContent({ step }: { step: AgentTraceStep }) {
  switch (step.type) {
    case "user_message":
      return <p className="trace-message-content">{step.content}</p>;
    case "model_response":
      return (
        <div className="trace-model-details">
          <p>Model returned response data for reasoning round {step.round}.</p>
          <span>
            Response ID <code>{step.responseId}</code>
          </span>
        </div>
      );
    case "tool_call":
      return (
        <>
          <div className="trace-tool-heading">
            <code className="trace-tool-name">{step.name}</code>
            <span>Call ID: {step.callId}</span>
          </div>
          <div className="trace-code-block">
            <span>Arguments</span>
            <pre>{formatJson(step.arguments)}</pre>
          </div>
        </>
      );
    case "confirmation_required":
      return (
        <div className="trace-decision-content">
          <p>
            Execution of <code>{step.name}</code> paused for explicit approval.
          </p>
          <span>Confirmation ID: {step.confirmationId}</span>
        </div>
      );
    case "confirmation_resolved":
      return (
        <div className="trace-decision-content">
          <p>{step.approved ? "Action confirmed by the user." : "Action cancelled by the user."}</p>
          <span>Confirmation ID: {step.confirmationId}</span>
        </div>
      );
    case "tool_result": {
      const status = getResultStatus(step.result);
      return (
        <>
          <div className="trace-tool-heading">
            <code className="trace-tool-name">{step.name}</code>
            {status ? <span className={`trace-result-status is-${status}`}>{status}</span> : null}
          </div>
          <div className="trace-code-block">
            <span>Result</span>
            <pre>{formatJson(step.result)}</pre>
          </div>
        </>
      );
    }
    case "final_answer":
      return <p className="trace-message-content trace-final-content">{step.content}</p>;
  }
}

export function TracePanel({
  trace,
  isRunning,
  variant = "panel",
  capturedAt,
}: TracePanelProps) {
  const [activeFilter, setActiveFilter] = useState<TraceFilter>("all");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const filteredTrace = useMemo(
    () => trace.filter((step) => filterTypes[activeFilter].includes(step.type)),
    [activeFilter, trace],
  );
  const toolCallCount = trace.filter((step) => step.type === "tool_call").length;
  const toolResultCount = trace.filter((step) => step.type === "tool_result").length;
  const hasPendingApproval = trace.at(-1)?.type === "confirmation_required";
  const hasFinalAnswer = trace.some((step) => step.type === "final_answer");
  const status = isRunning
    ? "Running"
    : hasPendingApproval
      ? "Awaiting approval"
      : hasFinalAnswer
        ? "Completed"
        : "Ready";
  const formattedCapturedAt = formatCapturedAt(capturedAt);

  const copyTrace = async () => {
    try {
      await navigator.clipboard.writeText(formatJson(trace));
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }

    window.setTimeout(() => setCopyState("idle"), 1_800);
  };

  return (
    <section
      className={`trace-panel trace-panel-${variant}`}
      aria-labelledby={`trace-title-${variant}`}
    >
      <header className="trace-header">
        <div>
          <p className="section-kicker">Execution log</p>
          <h2 id={`trace-title-${variant}`}>
            {variant === "screen" ? "Latest agent trace" : "Agent trace"}
          </h2>
          {formattedCapturedAt ? (
            <time dateTime={capturedAt}>{formattedCapturedAt}</time>
          ) : null}
        </div>
        <div className="trace-header-actions">
          {variant === "screen" && trace.length > 0 ? (
            <button className="trace-copy-button" type="button" onClick={() => void copyTrace()}>
              {copyState === "copied"
                ? "Copied"
                : copyState === "failed"
                  ? "Copy failed"
                  : "Copy JSON"}
            </button>
          ) : null}
          <span className={`trace-state ${isRunning ? "is-running" : ""}`}>
            <span aria-hidden="true" />
            {status}
          </span>
        </div>
      </header>

      {variant === "screen" && trace.length > 0 ? (
        <>
          <div className="trace-summary" aria-label="Trace summary">
            <div>
              <strong>{trace.length}</strong>
              <span>Total steps</span>
            </div>
            <div>
              <strong>{toolCallCount}</strong>
              <span>Tool calls</span>
            </div>
            <div>
              <strong>{toolResultCount}</strong>
              <span>Tool results</span>
            </div>
          </div>
          <div className="trace-filters" aria-label="Filter trace steps">
            {(Object.keys(filterTypes) as TraceFilter[]).map((filter) => {
              const count = trace.filter((step) => filterTypes[filter].includes(step.type)).length;
              return (
                <button
                  className={activeFilter === filter ? "is-active" : undefined}
                  key={filter}
                  type="button"
                  onClick={() => setActiveFilter(filter)}
                  aria-pressed={activeFilter === filter}
                >
                  {filter}
                  <span>{count}</span>
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      <div className="trace-list" aria-live="polite">
        {trace.length === 0 ? (
          <div className="trace-empty">
            <span aria-hidden="true">{`{ }`}</span>
            <h3>No trace captured yet</h3>
            <p>Run an investigation in Chat to record the agent's decisions and tool activity.</p>
            {variant === "screen" ? <a href="/">Start an investigation</a> : null}
          </div>
        ) : filteredTrace.length === 0 ? (
          <div className="trace-filter-empty">
            No steps match this filter.
          </div>
        ) : (
          filteredTrace.map((step) => {
            const originalIndex = trace.indexOf(step);
            return (
              <article
                className={`trace-step trace-${step.type}`}
                key={`${step.type}-${originalIndex}`}
              >
                <div className="trace-marker" aria-hidden="true">
                  {String(originalIndex + 1).padStart(2, "0")}
                </div>
                <div className="trace-body">
                  <span className="trace-label">{labels[step.type]}</span>
                  <TraceContent step={step} />
                </div>
              </article>
            );
          })
        )}
        {isRunning ? (
          <div className="trace-loading" aria-label="Agent is processing">
            <span />
            <span />
            <span />
          </div>
        ) : null}
      </div>
    </section>
  );
}
