import assert from "node:assert/strict";
import { it } from "node:test";

import { buildApp } from "./app.js";
import { createLocalDataStore, createOperationalDataSeed } from "./data/index.js";

it("wires the local data store into the Fastify application", async () => {
  const now = new Date("2026-08-10T10:00:00.000Z");
  const dataStore = createLocalDataStore(createOperationalDataSeed(now));
  const app = buildApp({ dataStore });

  await app.ready();

  assert.equal(app.dataStore, dataStore);
  assert.equal(app.dataStore.getServiceHealth("payments-api")?.status, "healthy");

  await app.close();
});
