import assert from "node:assert/strict";
import { it } from "node:test";

import { buildApp } from "./app.js";
import { createLocalDataStore, createOperationalDataSeed } from "./data/index.js";

it("wires the local data store into the Fastify application", async () => {
  const now = new Date("2026-08-10T10:00:00.000Z");
  const dataStore = createLocalDataStore(createOperationalDataSeed(now));
  const app = buildApp({ dataStore, agentRunner: null });

  await app.ready();

  assert.equal(app.dataStore, dataStore);
  assert.equal(app.dataStore.getServiceHealth("payments-api")?.status, "healthy");

  await app.close();
});

it("returns a clear error when the OpenAI agent is not configured", async () => {
  const app = buildApp({ agentRunner: null });
  const response = await app.inject({
    method: "POST",
    url: "/api/agent/run",
    payload: { message: "Investigate payment failures." },
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error.code, "agent_not_configured");

  await app.close();
});

it("exposes the agent runner through a typed Fastify route", async () => {
  const app = buildApp({
    agentRunner: {
      async run(message) {
        return {
          status: "completed",
          requiresConfirmation: false,
          answer: "Investigation complete.",
          trace: [{ type: "user_message", content: message }],
        };
      },
      async resolveConfirmation() {
        throw new Error("No confirmation is expected in this test.");
      },
    },
  });
  const response = await app.inject({
    method: "POST",
    url: "/api/agent/run",
    payload: { message: "Investigate payment failures." },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().answer, "Investigation complete.");

  await app.close();
});

it("resolves a pending dangerous action through the confirmation route", async () => {
  let receivedDecision: { id: string; approved: boolean } | undefined;
  const app = buildApp({
    agentRunner: {
      async run() {
        throw new Error("No initial run is expected in this test.");
      },
      async resolveConfirmation(confirmationId, approved) {
        receivedDecision = { id: confirmationId, approved };
        return {
          status: "completed",
          requiresConfirmation: false,
          answer: "The payment retry was queued.",
          trace: [],
        };
      },
    },
  });
  const response = await app.inject({
    method: "POST",
    url: "/api/agent/confirm",
    payload: { confirmationId: "confirmation_123", approved: true },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(receivedDecision, { id: "confirmation_123", approved: true });
  assert.equal(response.json().answer, "The payment retry was queued.");

  await app.close();
});
