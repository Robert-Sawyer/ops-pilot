import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createOperationalDataSeed } from "./fixtures.js";
import { createLocalDataStore } from "./local-data-store.js";
import { isServiceName, serviceNames } from "./types.js";

const now = new Date("2026-08-10T10:00:00.000Z");

const createStore = () => createLocalDataStore(createOperationalDataSeed(now));

describe("local data store", () => {
  it("contains the three supported services", () => {
    const store = createStore();

    assert.deepEqual(
      store.listServiceHealth().map(({ service }) => service),
      serviceNames,
    );
    assert.equal(isServiceName("payments-api"), true);
    assert.equal(isServiceName("unknown-api"), false);
  });

  it("returns health records without exposing mutable fixture state", () => {
    const store = createStore();
    const health = store.getServiceHealth("payments-api");

    assert.equal(health?.status, "healthy");
    assert.ok(health);
    health.status = "down";
    assert.equal(store.getServiceHealth("payments-api")?.status, "healthy");
  });

  it("filters recent errors by service and timestamp", () => {
    const store = createStore();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60_000);
    const errors = store.getRecentErrors("payments-api", tenMinutesAgo);

    assert.equal(errors.length, 1);
    assert.equal(errors[0]?.code, "PAYMENT_GATEWAY_TIMEOUT");
    assert.equal(errors[0]?.count, 17);
  });

  it("returns the most relevant runbook sections", () => {
    const store = createStore();
    const results = store.searchRunbooks("payment gateway timeout", 3);

    assert.equal(results.length, 3);
    assert.ok(
      results.every(
        ({ runbookId }) => runbookId === "runbook_payment_gateway_timeout",
      ),
    );
    assert.equal(results[0]?.heading, "Identify retryable gateway timeouts");
  });

  it("reads, filters, and updates payments", () => {
    const store = createStore();

    assert.equal(store.listPayments({ status: "failed" }).length, 2);
    assert.equal(store.getPayment("payment_123")?.failureCode, "PAYMENT_GATEWAY_TIMEOUT");

    const updated = store.updatePayment("payment_123", {
      status: "processing",
      updatedAt: now.toISOString(),
      failureCode: null,
      failureReason: null,
    });

    assert.equal(updated?.status, "processing");
    assert.equal(updated?.failureCode, undefined);
    assert.equal(store.getPayment("payment_123")?.status, "processing");
    assert.equal(store.updatePayment("payment_missing", { status: "failed" }), null);
  });

  it("creates and lists incident notes", () => {
    const store = createStore();
    const note = store.createIncidentNote({
      service: "payments-api",
      title: "Gateway timeout investigation",
      content: "The provider returned gateway timeout errors.",
      createdAt: now.toISOString(),
    });

    assert.equal(note.id, "incident_note_1");
    assert.deepEqual(store.listIncidentNotes(), [note]);
  });
});
