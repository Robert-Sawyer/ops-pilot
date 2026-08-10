import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createLocalDataStore, createOperationalDataSeed } from "../data/index.js";
import { createOperationalToolRegistry } from "./operational-tools.js";

const now = new Date("2026-08-10T10:00:00.000Z");

const createRegistry = () => {
  const dataStore = createLocalDataStore(createOperationalDataSeed(now));
  return {
    dataStore,
    registry: createOperationalToolRegistry({ dataStore, now: () => now }),
  };
};

describe("operational tool registry", () => {
  it("exposes strict OpenAI function definitions", () => {
    const { registry } = createRegistry();

    assert.deepEqual(
      registry.definitions.map(({ name }) => name),
      [
        "get_service_health",
        "get_recent_errors",
        "search_runbook",
        "get_payment",
        "create_incident_note",
      ],
    );
    assert.ok(registry.definitions.every(({ strict }) => strict === true));
  });

  it("executes health and recent-error tools against the local store", async () => {
    const { registry } = createRegistry();
    const health = await registry.execute(
      "get_service_health",
      JSON.stringify({ service: "payments-api" }),
    );
    const errors = await registry.execute(
      "get_recent_errors",
      JSON.stringify({ service: "payments-api" }),
    );

    assert.equal(health.ok && (health.data as { status: string }).status, "healthy");
    assert.equal(
      errors.ok && (errors.data as { totalOccurrences: number }).totalOccurrences,
      17,
    );
  });

  it("searches runbooks and reads a payment", async () => {
    const { registry } = createRegistry();
    const runbook = await registry.execute(
      "search_runbook",
      JSON.stringify({ query: "payment gateway timeout" }),
    );
    const payment = await registry.execute(
      "get_payment",
      JSON.stringify({ paymentId: "payment_123" }),
    );

    assert.equal(runbook.ok && (runbook.data as { resultCount: number }).resultCount, 3);
    assert.equal(payment.ok && (payment.data as { status: string }).status, "failed");
  });

  it("validates model arguments before executing a tool", async () => {
    const { registry } = createRegistry();
    const result = await registry.execute(
      "get_service_health",
      JSON.stringify({ service: "unknown-api" }),
    );

    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error.code, "invalid_arguments");
  });

  it("creates incident notes with a server-controlled timestamp", async () => {
    const { dataStore, registry } = createRegistry();
    const result = await registry.execute(
      "create_incident_note",
      JSON.stringify({
        service: "payments-api",
        title: "Payment failures",
        content: "17 gateway timeout errors occurred in the last 10 minutes.",
      }),
    );

    assert.equal(result.ok, true);
    assert.equal(dataStore.listIncidentNotes()[0]?.createdAt, now.toISOString());
  });
});
