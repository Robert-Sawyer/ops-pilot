import cors from "@fastify/cors";
import Fastify from "fastify";

import { createLocalDataStore, type LocalDataStore } from "./data/index.js";

declare module "fastify" {
  interface FastifyInstance {
    dataStore: LocalDataStore;
  }
}

export interface BuildAppOptions {
  dataStore?: LocalDataStore;
}

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: true });

  app.decorate("dataStore", options.dataStore ?? createLocalDataStore());

  void app.register(cors, {
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
  });

  app.get("/health", async () => ({
    service: "ops-pilot-api",
    status: "ok",
    timestamp: new Date().toISOString(),
  }));

  return app;
}
