import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiRequestError, getEvent } from "@/lib/api";
import {
  deliveryStatusLabel,
  formatDate,
  formatJson,
} from "@/lib/format";
import styles from "./page.module.css";
import { RetryButton } from "./retry-button";

interface EventPageProps {
  params: Promise<{
    id: string;
  }>;
}

export const metadata: Metadata = {
  title: "Детали события",
};

export default async function EventPage({
  params,
}: EventPageProps) {
  const { id } = await params;

  let event;

  try {
    event = await getEvent(id);
  } catch (error: unknown) {
    if (error instanceof ApiRequestError && error.status === 404) {
      notFound();
    }

    return (
      <main className={styles.page}>
        <Link href="/" className={styles.backLink}>
          ← К списку событий
        </Link>

        <section className={styles.errorState}>
          <h1>Не удалось загрузить событие</h1>
          <p>
            {error instanceof Error
              ? error.message
              : "Неизвестная ошибка"}
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <Link href="/" className={styles.backLink}>
        ← К списку событий
      </Link>

      <div className={styles.heading}>
        <div>
          <h1>Событие</h1>
          <p className={styles.eventId}>{event.id}</p>
        </div>

        <RetryButton eventId={event.id} />
      </div>

      <section className={styles.summary}>
        <div>
          <span className={styles.label}>Статус</span>
          <span
            className={`${styles.status} ${
              styles[event.delivery.status]
            }`}
          >
            {deliveryStatusLabel(event.delivery.status)}
          </span>
        </div>

        <div>
          <span className={styles.label}>Получено</span>
          <time dateTime={event.receivedAt}>
            {formatDate(event.receivedAt)}
          </time>
        </div>

        <div>
          <span className={styles.label}>Источник</span>
          <span className={styles.monospace}>
            {event.sourceId}
          </span>
        </div>

        <div>
          <span className={styles.label}>Попыток</span>
          <span>{event.delivery.attempts.length}</span>
        </div>
      </section>

      {event.delivery.lastError ? (
        <section className={styles.lastError}>
          <h2>Последняя ошибка</h2>
          <p>{event.delivery.lastError}</p>
        </section>
      ) : null}

      <section className={styles.card}>
        <h2>Тело события</h2>
        <pre>{formatJson(event.body)}</pre>
      </section>

      <section className={styles.card}>
        <h2>Сохранённые заголовки</h2>
        <pre>{formatJson(event.headers)}</pre>
      </section>

      <section className={styles.card}>
        <h2>История доставки</h2>

        {event.delivery.attempts.length === 0 ? (
          <p className={styles.emptyAttempts}>
            Попыток доставки ещё не было.
          </p>
        ) : (
          <div className={styles.attemptsWrapper}>
            <table className={styles.attempts}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Время</th>
                  <th>HTTP-статус</th>
                  <th>Ошибка</th>
                </tr>
              </thead>

              <tbody>
                {event.delivery.attempts.map(
                  (attempt, index) => (
                    <tr key={`${attempt.at}-${index}`}>
                      <td>{index + 1}</td>
                      <td>
                        <time dateTime={attempt.at}>
                          {formatDate(attempt.at)}
                        </time>
                      </td>
                      <td>
                        {attempt.statusCode === null
                          ? "—"
                          : attempt.statusCode}
                      </td>
                      <td>
                        {attempt.error ?? (
                          <span className={styles.success}>
                            Успешно
                          </span>
                        )}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
