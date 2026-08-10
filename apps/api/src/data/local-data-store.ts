import { createOperationalDataSeed } from "./fixtures.js";
import type {
  OperationalDataSeed,
  Payment,
  PaymentStatus,
  PaymentUpdate,
  RunbookSearchResult,
  ServiceError,
  ServiceHealth,
  ServiceName,
} from "./types.js";

export interface ListPaymentFilters {
  status?: PaymentStatus;
}

export interface LocalDataStore {
  listServiceHealth(): ServiceHealth[];
  getServiceHealth(service: ServiceName): ServiceHealth | null;
  getRecentErrors(service: ServiceName, since?: Date): ServiceError[];
  searchRunbooks(query: string, limit?: number): RunbookSearchResult[];
  listPayments(filters?: ListPaymentFilters): Payment[];
  getPayment(paymentId: string): Payment | null;
  updatePayment(paymentId: string, update: PaymentUpdate): Payment | null;
}

const clone = <T>(value: T): T => structuredClone(value);

const tokenize = (value: string) =>
  value
    .toLocaleLowerCase("en")
    .split(/[^a-z0-9-]+/)
    .filter((token) => token.length > 1);

const scoreText = (queryTokens: string[], value: string) => {
  const normalizedValue = value.toLocaleLowerCase("en");

  return queryTokens.reduce(
    (score, token) => score + (normalizedValue.includes(token) ? 1 : 0),
    0,
  );
};

export function createLocalDataStore(
  seed: OperationalDataSeed = createOperationalDataSeed(),
): LocalDataStore {
  const data = clone(seed);

  return {
    listServiceHealth() {
      return clone(data.serviceHealth);
    },

    getServiceHealth(service) {
      const record = data.serviceHealth.find((item) => item.service === service);
      return record ? clone(record) : null;
    },

    getRecentErrors(service, since) {
      const minimumTimestamp = since?.getTime() ?? Number.NEGATIVE_INFINITY;

      return clone(
        data.errors
          .filter(
            (error) =>
              error.service === service &&
              new Date(error.lastSeenAt).getTime() >= minimumTimestamp,
          )
          .sort(
            (left, right) =>
              new Date(right.lastSeenAt).getTime() -
              new Date(left.lastSeenAt).getTime(),
          ),
      );
    },

    searchRunbooks(query, limit = 3) {
      const queryTokens = tokenize(query);
      if (queryTokens.length === 0 || limit <= 0) {
        return [];
      }

      const results: RunbookSearchResult[] = [];

      for (const runbook of data.runbooks) {
        const runbookContext = [
          runbook.title,
          runbook.summary,
          ...runbook.tags,
          ...runbook.services,
        ].join(" ");

        for (const section of runbook.sections) {
          const sectionScore = scoreText(
            queryTokens,
            `${section.heading} ${section.content}`,
          );
          const contextScore = scoreText(queryTokens, runbookContext);
          const score = sectionScore * 2 + contextScore;

          if (score > 0) {
            results.push({
              runbookId: runbook.id,
              runbookTitle: runbook.title,
              sectionId: section.id,
              heading: section.heading,
              content: section.content,
              score,
            });
          }
        }
      }

      return clone(
        results
          .sort(
            (left, right) =>
              right.score - left.score ||
              left.runbookTitle.localeCompare(right.runbookTitle) ||
              left.heading.localeCompare(right.heading),
          )
          .slice(0, limit),
      );
    },

    listPayments(filters = {}) {
      return clone(
        data.payments.filter(
          (payment) => !filters.status || payment.status === filters.status,
        ),
      );
    },

    getPayment(paymentId) {
      const payment = data.payments.find((item) => item.id === paymentId);
      return payment ? clone(payment) : null;
    },

    updatePayment(paymentId, update) {
      const payment = data.payments.find((item) => item.id === paymentId);
      if (!payment) {
        return null;
      }

      if (update.status !== undefined) {
        payment.status = update.status;
      }
      if (update.updatedAt !== undefined) {
        payment.updatedAt = update.updatedAt;
      }
      if (update.failureCode === null) {
        delete payment.failureCode;
      } else if (update.failureCode !== undefined) {
        payment.failureCode = update.failureCode;
      }
      if (update.failureReason === null) {
        delete payment.failureReason;
      } else if (update.failureReason !== undefined) {
        payment.failureReason = update.failureReason;
      }

      return clone(payment);
    },
  };
}
