export const serviceNames = [
  "payments-api",
  "notifications-api",
  "user-service",
] as const;

export type ServiceName = (typeof serviceNames)[number];

export type ServiceStatus = "healthy" | "degraded" | "down";

export interface ServiceHealth {
  service: ServiceName;
  status: ServiceStatus;
  latencyMs: number;
  version: string;
  checkedAt: string;
}

export type ErrorSeverity = "warning" | "critical";

export interface ServiceError {
  id: string;
  service: ServiceName;
  code: string;
  message: string;
  severity: ErrorSeverity;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  context?: Record<string, string>;
}

export interface RunbookSection {
  id: string;
  heading: string;
  content: string;
}

export interface Runbook {
  id: string;
  title: string;
  services: ServiceName[];
  summary: string;
  tags: string[];
  sections: RunbookSection[];
}

export interface RunbookSearchResult {
  runbookId: string;
  runbookTitle: string;
  sectionId: string;
  heading: string;
  content: string;
  score: number;
}

export type PaymentStatus = "succeeded" | "failed" | "processing";

export interface Payment {
  id: string;
  customerId: string;
  amount: number;
  currency: "EUR" | "USD" | "PLN";
  status: PaymentStatus;
  provider: string;
  createdAt: string;
  updatedAt: string;
  failureCode?: string;
  failureReason?: string;
}

export interface OperationalDataSeed {
  serviceHealth: ServiceHealth[];
  errors: ServiceError[];
  runbooks: Runbook[];
  payments: Payment[];
  incidentNotes: IncidentNote[];
}

export interface PaymentUpdate {
  status?: PaymentStatus;
  updatedAt?: string;
  failureCode?: string | null;
  failureReason?: string | null;
}

export interface IncidentNote {
  id: string;
  service: ServiceName;
  title: string;
  content: string;
  createdAt: string;
}

export type CreateIncidentNoteInput = Omit<IncidentNote, "id">;

export function isServiceName(value: string): value is ServiceName {
  return serviceNames.some((serviceName) => serviceName === value);
}
