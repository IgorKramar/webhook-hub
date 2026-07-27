export type DeliveryStatus = 'pending' | 'delivered' | 'failed';

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

export interface StoredEvent {
  id: string;
  sourceId: string;
  /** Whitelist заголовков; x-webhook-secret замаскирован как "***". */
  headers: Record<string, string>;
  body: unknown;
  receivedAt: string;
  delivery: Delivery;
}
