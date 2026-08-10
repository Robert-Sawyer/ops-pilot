import type { OperationalDataSeed } from "./types.js";

const minutesBefore = (now: Date, minutes: number) =>
  new Date(now.getTime() - minutes * 60_000).toISOString();

export function createOperationalDataSeed(
  now: Date = new Date(),
): OperationalDataSeed {
  return {
    serviceHealth: [
      {
        service: "payments-api",
        status: "healthy",
        latencyMs: 84,
        version: "2.8.1",
        checkedAt: minutesBefore(now, 0.5),
      },
      {
        service: "notifications-api",
        status: "degraded",
        latencyMs: 642,
        version: "1.14.3",
        checkedAt: minutesBefore(now, 0.75),
      },
      {
        service: "user-service",
        status: "healthy",
        latencyMs: 51,
        version: "3.2.0",
        checkedAt: minutesBefore(now, 0.25),
      },
    ],
    errors: [
      {
        id: "error_payments_gateway_timeout",
        service: "payments-api",
        code: "PAYMENT_GATEWAY_TIMEOUT",
        message: "Payment provider did not respond before the 5 second timeout.",
        severity: "critical",
        count: 17,
        firstSeenAt: minutesBefore(now, 9),
        lastSeenAt: minutesBefore(now, 1),
        context: {
          provider: "acme-pay",
          endpoint: "/v1/charges",
        },
      },
      {
        id: "error_payments_invalid_card",
        service: "payments-api",
        code: "CARD_DECLINED",
        message: "Payment provider declined the card.",
        severity: "warning",
        count: 3,
        firstSeenAt: minutesBefore(now, 42),
        lastSeenAt: minutesBefore(now, 18),
        context: {
          provider: "acme-pay",
        },
      },
      {
        id: "error_notifications_rate_limit",
        service: "notifications-api",
        code: "PROVIDER_RATE_LIMITED",
        message: "Email provider returned HTTP 429.",
        severity: "warning",
        count: 26,
        firstSeenAt: minutesBefore(now, 24),
        lastSeenAt: minutesBefore(now, 2),
        context: {
          provider: "mail-box",
          channel: "email",
        },
      },
      {
        id: "error_users_token_expired",
        service: "user-service",
        code: "TOKEN_EXPIRED",
        message: "A client attempted to use an expired access token.",
        severity: "warning",
        count: 4,
        firstSeenAt: minutesBefore(now, 55),
        lastSeenAt: minutesBefore(now, 22),
      },
    ],
    runbooks: [
      {
        id: "runbook_payment_gateway_timeout",
        title: "Payment gateway timeouts",
        services: ["payments-api"],
        summary:
          "Diagnosis and recovery steps for timeouts returned by the payment provider.",
        tags: ["payments", "gateway", "timeout", "provider"],
        sections: [
          {
            id: "check-provider",
            heading: "Check provider availability",
            content:
              "Check the payment provider status page and current latency before retrying requests.",
          },
          {
            id: "identify-failed-payment",
            heading: "Identify retryable gateway timeouts",
            content:
              "Only payment gateway timeout failures are retryable. Declines and validation failures must not be retried.",
          },
          {
            id: "retry-safely",
            heading: "Retry the payment safely",
            content:
              "Confirm the provider is available, verify the payment is still failed, and use its idempotency key for a single retry.",
          },
        ],
      },
      {
        id: "runbook_notification_delivery",
        title: "Notification delivery delays",
        services: ["notifications-api"],
        summary:
          "How to diagnose delayed email and push notification delivery.",
        tags: ["notifications", "email", "rate-limit", "queue"],
        sections: [
          {
            id: "inspect-provider-limits",
            heading: "Inspect provider limits",
            content:
              "Check provider rate-limit headers and reduce worker concurrency when HTTP 429 responses increase.",
          },
          {
            id: "inspect-queue",
            heading: "Inspect queue depth",
            content:
              "Compare queue depth with the normal baseline and confirm that workers are consuming jobs.",
          },
        ],
      },
      {
        id: "runbook_user_authentication",
        title: "User authentication errors",
        services: ["user-service"],
        summary:
          "Investigation steps for access-token and login failures.",
        tags: ["users", "authentication", "token", "login"],
        sections: [
          {
            id: "token-expiry",
            heading: "Validate token expiry",
            content:
              "Confirm whether failures are caused by normally expired tokens before escalating the incident.",
          },
          {
            id: "signing-keys",
            heading: "Check signing keys",
            content:
              "Verify that the active signing key matches the key advertised by the authentication service.",
          },
        ],
      },
    ],
    payments: [
      {
        id: "payment_123",
        customerId: "customer_201",
        amount: 129.99,
        currency: "USD",
        status: "failed",
        provider: "acme-pay",
        createdAt: minutesBefore(now, 8),
        updatedAt: minutesBefore(now, 7),
        failureCode: "PAYMENT_GATEWAY_TIMEOUT",
        failureReason: "The provider did not respond before the timeout.",
      },
      {
        id: "payment_124",
        customerId: "customer_202",
        amount: 79,
        currency: "EUR",
        status: "succeeded",
        provider: "acme-pay",
        createdAt: minutesBefore(now, 35),
        updatedAt: minutesBefore(now, 34),
      },
      {
        id: "payment_125",
        customerId: "customer_203",
        amount: 249.5,
        currency: "PLN",
        status: "processing",
        provider: "acme-pay",
        createdAt: minutesBefore(now, 3),
        updatedAt: minutesBefore(now, 2),
      },
      {
        id: "payment_126",
        customerId: "customer_204",
        amount: 41.25,
        currency: "EUR",
        status: "failed",
        provider: "acme-pay",
        createdAt: minutesBefore(now, 16),
        updatedAt: minutesBefore(now, 15),
        failureCode: "CARD_DECLINED",
        failureReason: "The card was declined by the provider.",
      },
    ],
    incidentNotes: [],
  };
}
