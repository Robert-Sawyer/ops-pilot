import cors from "@fastify/cors";
import Fastify from "fastify";

export function buildApp() {
  const app = Fastify({ logger: true });

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
