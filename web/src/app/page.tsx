import type { Metadata } from "next";
import Link from "next/link";
import {
  deliveryStatusLabel,
  filterStatusLabel,
  formatDate,
} from "@/lib/format";
import { getEvents, getSources } from "@/lib/api";
import type {
  EventsPage,
  EventStatusFilter,
  Source,
} from "@/lib/types";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "События",
};

const STATUS_FILTERS: EventStatusFilter[] = [
  "received",
  "pending",
  "delivered",
  "failed",
];

interface HomeSearchParams {
  sourceId?: string | string[];
  status?: string | string[];
  page?: string | string[];
}

interface HomeProps {
  searchParams: Promise<HomeSearchParams>;
}

export default async function Home({
  searchParams,
}: HomeProps) {
  const rawSearchParams = await searchParams;

  const sourceId = firstValue(rawSearchParams.sourceId);
  const status = parseStatus(firstValue(rawSearchParams.status));
  const page = parsePage(firstValue(rawSearchParams.page));

  let eventsPage: EventsPage;
  let sources: Source[];

  try {
    [eventsPage, sources] = await Promise.all([
      getEvents({
        sourceId,
        status,
        page,
        limit: 20,
      }),
      getSources(),
    ]);
  } catch (error: unknown) {
    return (
      <main className={styles.page}>
        <section className={styles.errorState}>
          <h1>Не удалось загрузить события</h1>
          <p>{errorMessage(error)}</p>
          <p>
            Проверьте, что API запущен на адресе, указанном в{" "}
            <code>NEXT_PUBLIC_API_URL</code>.
          </p>
        </section>
      </main>
    );
  }

  const totalPages = Math.max(
    1,
    Math.ceil(eventsPage.total / eventsPage.limit),
  );

  return (
    <main className={styles.page}>
      <div className={styles.heading}>
        <div>
          <h1>Webhook-события</h1>
          <p>
            Принятые события и состояние их доставки подписчикам.
          </p>
        </div>

        <div className={styles.counter}>
          Всего: <strong>{eventsPage.total}</strong>
        </div>
      </div>

      <form className={styles.filters} method="get">
        <label className={styles.field}>
          <span>Источник</span>
          <select name="sourceId" defaultValue={sourceId ?? ""}>
            <option value="">Все источники</option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span>Статус</span>
          <select name="status" defaultValue={status ?? ""}>
            <option value="">Все статусы</option>
            {STATUS_FILTERS.map((filterStatus) => (
              <option key={filterStatus} value={filterStatus}>
                {filterStatusLabel(filterStatus)}
              </option>
            ))}
          </select>
        </label>

        <div className={styles.filterActions}>
          <button type="submit" className={styles.primaryButton}>
            Применить
          </button>

          <Link href="/" className={styles.secondaryButton}>
            Сбросить
          </Link>
        </div>
      </form>

      {eventsPage.items.length === 0 ? (
        <section className={styles.emptyState}>
          <h2>События не найдены</h2>
          <p>
            Отправьте webhook или измените выбранные фильтры.
          </p>
        </section>
      ) : (
        <>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Получено</th>
                  <th>Источник</th>
                  <th>Статус</th>
                  <th>Попытки</th>
                  <th aria-label="Действия" />
                </tr>
              </thead>

              <tbody>
                {eventsPage.items.map((event) => {
                  const source = sources.find(
                    (item) => item.id === event.sourceId,
                  );

                  return (
                    <tr key={event.id}>
                      <td>
                        <time dateTime={event.receivedAt}>
                          {formatDate(event.receivedAt)}
                        </time>
                        <span className={styles.eventId}>
                          {event.id}
                        </span>
                      </td>

                      <td>
                        <span className={styles.sourceName}>
                          {source?.name ?? "Неизвестный источник"}
                        </span>
                        <span className={styles.sourceId}>
                          {event.sourceId}
                        </span>
                      </td>

                      <td>
                        <span
                          className={`${styles.status} ${
                            styles[event.delivery.status]
                          }`}
                        >
                          {deliveryStatusLabel(
                            event.delivery.status,
                          )}
                        </span>
                      </td>

                      <td>{event.delivery.attempts.length}</td>

                      <td className={styles.actionCell}>
                        <Link
                          href={`/events/${event.id}`}
                          className={styles.detailsLink}
                        >
                          Подробнее
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <nav
            className={styles.pagination}
            aria-label="Пагинация событий"
          >
            {eventsPage.page > 1 ? (
              <Link
                href={pageHref({
                  page: eventsPage.page - 1,
                  sourceId,
                  status,
                })}
                className={styles.pageLink}
              >
                ← Назад
              </Link>
            ) : (
              <span
                className={`${styles.pageLink} ${styles.disabled}`}
              >
                ← Назад
              </span>
            )}

            <span className={styles.pageInfo}>
              Страница {eventsPage.page} из {totalPages}
            </span>

            {eventsPage.page < totalPages ? (
              <Link
                href={pageHref({
                  page: eventsPage.page + 1,
                  sourceId,
                  status,
                })}
                className={styles.pageLink}
              >
                Вперёд →
              </Link>
            ) : (
              <span
                className={`${styles.pageLink} ${styles.disabled}`}
              >
                Вперёд →
              </span>
            )}
          </nav>
        </>
      )}
    </main>
  );
}

function firstValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseStatus(
  value: string | undefined,
): EventStatusFilter | undefined {
  return STATUS_FILTERS.find((status) => status === value);
}

function parsePage(value: string | undefined): number {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function pageHref(params: {
  page: number;
  sourceId?: string;
  status?: EventStatusFilter;
}): string {
  const searchParams = new URLSearchParams();

  if (params.sourceId) {
    searchParams.set("sourceId", params.sourceId);
  }

  if (params.status) {
    searchParams.set("status", params.status);
  }

  searchParams.set("page", String(params.page));

  return `/?${searchParams.toString()}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Неизвестная ошибка";
}
