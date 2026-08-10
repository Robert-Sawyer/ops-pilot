import { z } from "zod";

import { serviceNames, type LocalDataStore } from "../data/index.js";
import { createToolRegistry, defineTool } from "./tool-registry.js";

export interface OperationalToolDependencies {
  dataStore: LocalDataStore;
  now?: () => Date;
}

const serviceSchema = z.enum(serviceNames);

export function createOperationalToolRegistry({
  dataStore,
  now = () => new Date(),
}: OperationalToolDependencies) {
  const getServiceHealth = defineTool({
    name: "get_service_health",
    description:
      "Get the latest health status, latency, version, and check time for one monitored service.",
    parameters: z.strictObject({
      service: serviceSchema.describe("The monitored service to inspect."),
    }),
    execute: ({ service }) => dataStore.getServiceHealth(service),
  });

  const getRecentErrors = defineTool({
    name: "get_recent_errors",
    description:
      "Get error groups observed for one service during the last 10 minutes, including occurrence counts.",
    parameters: z.strictObject({
      service: serviceSchema.describe("The monitored service to inspect."),
    }),
    execute: ({ service }) => {
      const windowMinutes = 10;
      const since = new Date(now().getTime() - windowMinutes * 60_000);
      const errors = dataStore.getRecentErrors(service, since);

      return {
        service,
        windowMinutes,
        totalOccurrences: errors.reduce((total, error) => total + error.count, 0),
        errors,
      };
    },
  });

  const searchRunbook = defineTool({
    name: "search_runbook",
    description:
      "Search operational runbooks and return up to three relevant sections ranked by relevance.",
    parameters: z.strictObject({
      query: z
        .string()
        .min(2)
        .max(200)
        .describe("A concise operational issue or error to search for."),
    }),
    execute: ({ query }) => {
      const sections = dataStore.searchRunbooks(query, 3);
      return { query, resultCount: sections.length, sections };
    },
  });

  const getPayment = defineTool({
    name: "get_payment",
    description:
      "Get the current status and failure details of a payment by its identifier. This tool never retries a payment.",
    parameters: z.strictObject({
      paymentId: z
        .string()
        .min(1)
        .max(100)
        .describe("The payment identifier, for example payment_123."),
    }),
    execute: ({ paymentId }) => dataStore.getPayment(paymentId),
  });

  const createIncidentNote = defineTool({
    name: "create_incident_note",
    description:
      "Create a local incident note only when the user explicitly asks to record or document the investigation.",
    parameters: z.strictObject({
      service: serviceSchema.describe("The service associated with the note."),
      title: z.string().min(3).max(120).describe("A short incident note title."),
      content: z
        .string()
        .min(3)
        .max(2_000)
        .describe("A factual incident note based on tool evidence."),
    }),
    execute: ({ service, title, content }) =>
      dataStore.createIncidentNote({
        service,
        title,
        content,
        createdAt: now().toISOString(),
      }),
  });

  const retryPayment = defineTool({
    name: "retry_payment",
    description:
      "Request one retry of a failed payment. This dangerous action always requires explicit user confirmation before execution.",
    parameters: z.strictObject({
      paymentId: z
        .string()
        .min(1)
        .max(100)
        .describe("The failed payment identifier, for example payment_123."),
    }),
    confirmation: {
      title: "Retry failed payment?",
      describe: ({ paymentId }) => {
        const payment = dataStore.getPayment(paymentId);
        if (!payment) {
          return `Retry payment ${paymentId}. The payment will be validated again before execution.`;
        }

        return `Retry ${payment.id} for ${payment.currency} ${payment.amount.toFixed(2)} through ${payment.provider}.`;
      },
    },
    execute: ({ paymentId }) => {
      const payment = dataStore.getPayment(paymentId);
      if (!payment) {
        throw new Error(`Payment '${paymentId}' was not found.`);
      }
      if (payment.status !== "failed") {
        throw new Error(
          `Payment '${paymentId}' cannot be retried because its status is '${payment.status}'.`,
        );
      }
      if (payment.failureCode !== "PAYMENT_GATEWAY_TIMEOUT") {
        throw new Error(
          `Payment '${paymentId}' is not retryable because it did not fail with a gateway timeout.`,
        );
      }

      const updatedPayment = dataStore.updatePayment(paymentId, {
        status: "processing",
        updatedAt: now().toISOString(),
        failureCode: null,
        failureReason: null,
      });

      return { action: "retry_queued", payment: updatedPayment };
    },
  });

  return createToolRegistry([
    getServiceHealth,
    getRecentErrors,
    searchRunbook,
    getPayment,
    createIncidentNote,
    retryPayment,
  ]);
}
