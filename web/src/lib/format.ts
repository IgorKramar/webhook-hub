import type {
  DeliveryStatus,
  EventStatusFilter,
} from "./types";

const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  pending: "Ожидает доставки",
  delivered: "Доставлено",
  failed: "Ошибка",
};

const FILTER_STATUS_LABELS: Record<EventStatusFilter, string> = {
  received: "Только принято",
  pending: "Ожидает доставки",
  delivered: "Доставлено",
  failed: "Ошибка",
};

export function deliveryStatusLabel(
  status: DeliveryStatus,
): string {
  return DELIVERY_STATUS_LABELS[status];
}

export function filterStatusLabel(
  status: EventStatusFilter,
): string {
  return FILTER_STATUS_LABELS[status];
}

export function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

export function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
