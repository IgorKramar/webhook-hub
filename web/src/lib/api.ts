import type {
  EventsPage,
  EventStatusFilter,
  Source,
  WebhookEvent,
} from "./types";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4002";

interface EventsQuery {
  sourceId?: string;
  status?: EventStatusFilter;
  page?: number;
  limit?: number;
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export async function getEvents(
  query: EventsQuery,
): Promise<EventsPage> {
  const searchParams = new URLSearchParams();

  if (query.sourceId) {
    searchParams.set("sourceId", query.sourceId);
  }

  if (query.status) {
    searchParams.set("status", query.status);
  }

  searchParams.set("page", String(query.page ?? 1));
  searchParams.set("limit", String(query.limit ?? 20));

  return apiFetch<EventsPage>(
    `/api/events?${searchParams.toString()}`,
  );
}

export async function getEvent(id: string): Promise<WebhookEvent> {
  return apiFetch<WebhookEvent>(
    `/api/events/${encodeURIComponent(id)}`,
  );
}

export async function getSources(): Promise<Source[]> {
  return apiFetch<Source[]>("/api/sources");
}

async function apiFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    let message = `API вернул HTTP ${response.status}`;

    try {
      const errorBody = (await response.json()) as {
        error?: unknown;
      };

      if (typeof errorBody.error === "string") {
        message = errorBody.error;
      }
    } catch {
      // Ответ API может не содержать JSON.
    }

    throw new ApiRequestError(message, response.status);
  }

  return (await response.json()) as T;
}
