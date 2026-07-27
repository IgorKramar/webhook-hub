"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface RetryButtonProps {
  eventId: string;
}

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4002";

export function RetryButton({
  eventId,
}: RetryButtonProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function retry(): Promise<void> {
    setIsPending(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        `${API_URL}/api/events/${encodeURIComponent(eventId)}/retry`,
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        let errorMessage = `API вернул HTTP ${response.status}`;

        try {
          const body = (await response.json()) as {
            error?: unknown;
          };

          if (typeof body.error === "string") {
            errorMessage = body.error;
          }
        } catch {
          // Ответ API может не содержать JSON.
        }

        throw new Error(errorMessage);
      }

      setMessage("Новая серия доставки запущена.");
      router.refresh();
    } catch (retryError: unknown) {
      setError(
        retryError instanceof Error
          ? retryError.message
          : "Не удалось запустить доставку",
      );
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void retry()}
        disabled={isPending}
      >
        {isPending ? "Запускаем…" : "Повторить доставку"}
      </button>

      {message ? (
        <p role="status" className="retrySuccess">
          {message}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="retryError">
          {error}
        </p>
      ) : null}
    </div>
  );
}
