export type DeliveryStatus = "pending" | "delivered" | "failed";

export type EventStatusFilter =
  | "received"
  | "pending"
  | "delivered"
  | "failed";

export interface DeliveryAttempt {
  at: string;
  statusCode: number | null;
  error: string | null;
}

export interface Delivery {
  status: DeliveryStatus;
  attempts: DeliveryAttempt[];
  lastError: string | null;
}

export interface WebhookEvent {
  id: string;
  sourceId: string;
  headers: Record<string, string>;
  body: unknown;
  receivedAt: string;
  delivery: Delivery;
}

export interface EventsPage {
  items: WebhookEvent[];
  page: number;
  limit: number;
  total: number;
}

export interface Source {
  id: string;
  name: string;
  ingestUrl: string;
  hasSecret: boolean;
  subscriberUrl?: string;
  createdAt: string;
}

export interface ApiError {
  error: string;
  code: string;
}
