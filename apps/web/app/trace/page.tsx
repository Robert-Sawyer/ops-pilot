import type { Metadata } from "next";

import { AgentTraceScreen } from "../components/agent-trace-screen";

export const metadata: Metadata = {
  title: "Agent Trace | Ops Pilot",
  description:
    "Inspect Ops Pilot model rounds, tool calls, execution results, and final answers.",
};

export default function AgentTracePage() {
  return <AgentTraceScreen />;
}
