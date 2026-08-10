import type { AgentTraceStep } from "../../lib/agent-api";

interface TracePanelProps {
  trace: AgentTraceStep[];
  isRunning: boolean;
}

const labels: Record<AgentTraceStep["type"], string> = {
  user_message: "User",
  model_response: "Model",
  tool_call: "Tool call",
  confirmation_required: "Approval",
  confirmation_resolved: "Decision",
  tool_result: "Tool result",
  final_answer: "Final answer",
};

const formatJson = (value: unknown) => JSON.stringify(value, null, 2);

function TraceContent({ step }: { step: AgentTraceStep }) {
  switch (step.type) {
    case "user_message":
      return <p>{step.content}</p>;
    case "model_response":
      return (
        <p>
          Reasoning round {step.round} <code>{step.responseId}</code>
        </p>
      );
    case "tool_call":
      return (
        <>
          <code className="trace-tool-name">{step.name}</code>
          <pre>{formatJson(step.arguments)}</pre>
        </>
      );
    case "confirmation_required":
      return <p>Execution paused until the user reviews {step.name}.</p>;
    case "confirmation_resolved":
      return <p>{step.approved ? "Action confirmed." : "Action cancelled."}</p>;
    case "tool_result":
      return (
        <>
          <code className="trace-tool-name">{step.name}</code>
          <pre>{formatJson(step.result)}</pre>
        </>
      );
    case "final_answer":
      return <p>{step.content}</p>;
  }
}

export function TracePanel({ trace, isRunning }: TracePanelProps) {
  return (
    <aside className="trace-panel" aria-labelledby="trace-title">
      <header className="trace-header">
        <div>
          <p className="section-kicker">Execution log</p>
          <h2 id="trace-title">Agent trace</h2>
        </div>
        <span className={`trace-state ${isRunning ? "is-running" : ""}`}>
          <span aria-hidden="true" />
          {isRunning ? "Running" : "Ready"}
        </span>
      </header>

      <div className="trace-list" aria-live="polite">
        {trace.length === 0 ? (
          <div className="trace-empty">
            <span aria-hidden="true">{`{ }`}</span>
            <p>Tool calls and model decisions will appear here.</p>
          </div>
        ) : (
          trace.map((step, index) => (
            <article className={`trace-step trace-${step.type}`} key={`${step.type}-${index}`}>
              <div className="trace-marker" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className="trace-body">
                <span className="trace-label">{labels[step.type]}</span>
                <TraceContent step={step} />
              </div>
            </article>
          ))
        )}
        {isRunning ? (
          <div className="trace-loading" aria-label="Agent is processing">
            <span />
            <span />
            <span />
          </div>
        ) : null}
      </div>
    </aside>
  );
}
