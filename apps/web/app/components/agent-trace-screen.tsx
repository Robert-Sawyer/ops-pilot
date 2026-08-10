"use client";

import { useEffect, useState } from "react";

import {
  readStoredAgentTrace,
  type StoredAgentTrace,
} from "../../lib/trace-storage";
import { AppHeader } from "./app-header";
import { TracePanel } from "./trace-panel";

export function AgentTraceScreen() {
  const [snapshot, setSnapshot] = useState<StoredAgentTrace | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    setSnapshot(readStoredAgentTrace());
    setHasLoaded(true);
  }, []);

  const trace = snapshot?.trace ?? [];

  return (
    <div className="app-shell trace-screen-shell">
      <AppHeader activeView="trace" traceStepCount={trace.length} />

      <main className="trace-screen-main">
        <section className="trace-screen-intro" aria-labelledby="trace-page-title">
          <div>
            <p className="section-kicker">Audit trail</p>
            <h1 id="trace-page-title">See how the agent reached its answer</h1>
            <p>
              Inspect the latest user message, model rounds, tool arguments,
              execution results, approval decisions, and final response.
            </p>
          </div>
          <a className="button button-secondary trace-back-link" href="/">
            Back to chat
          </a>
        </section>

        {hasLoaded ? (
          <TracePanel
            trace={trace}
            isRunning={false}
            variant="screen"
            capturedAt={snapshot?.capturedAt}
          />
        ) : (
          <section className="trace-screen-loading" aria-live="polite">
            Loading the latest trace...
          </section>
        )}
      </main>

      <footer className="app-footer">
        <p>The latest trace is kept only in this browser tab.</p>
        <span>Auditable tool calls from request to final answer</span>
      </footer>
    </div>
  );
}
