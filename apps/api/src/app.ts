import cors from "@fastify/cors";
import Fastify from "fastify";

import { createConfiguredAgent, type AgentRunner } from "./agent/index.js";
import { createLocalDataStore, type LocalDataStore } from "./data/index.js";
import { registerAgentRoute } from "./routes/agent-route.js";

declare module "fastify" {
  interface FastifyInstance {
    dataStore: LocalDataStore;
  }
}

export interface BuildAppOptions {
  dataStore?: LocalDataStore;
  agentRunner?: AgentRunner | null;
}

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: true });
  const dataStore = options.dataStore ?? createLocalDataStore();
  const agentRunner =
    options.agentRunner === undefined
      ? createConfiguredAgent({ dataStore })
      : options.agentRunner;

  app.decorate("dataStore", dataStore);

  void app.register(cors, {
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
  });

  app.get("/health", async () => ({
    service: "ops-pilot-api",
    status: "ok",
    timestamp: new Date().toISOString(),
  }));

  registerAgentRoute(app, { agentRunner });

  return app;
}
