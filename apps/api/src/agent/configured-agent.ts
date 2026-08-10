import OpenAI from "openai";

import type { LocalDataStore } from "../data/index.js";
import { createOperationalToolRegistry } from "../tools/index.js";
import { createOpenAIAgentRunner } from "./openai-agent-runner.js";
import type { AgentRunner } from "./types.js";

export interface ConfiguredAgentOptions {
  dataStore: LocalDataStore;
  apiKey?: string;
  model?: string;
}

export function createConfiguredAgent({
  dataStore,
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_MODEL ?? "gpt-5-mini",
}: ConfiguredAgentOptions): AgentRunner | null {
  if (!apiKey?.trim()) {
    return null;
  }

  const openai = new OpenAI({ apiKey: apiKey.trim() });
  const tools = createOperationalToolRegistry({ dataStore });

  return createOpenAIAgentRunner({
    responses: {
      create: (parameters) => openai.responses.create(parameters),
    },
    tools,
    model: model.trim() || "gpt-5-mini",
  });
}
