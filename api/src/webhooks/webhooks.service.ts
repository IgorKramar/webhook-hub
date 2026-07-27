import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { DeliveryService } from '../delivery/delivery.service';
import { StoredEvent } from '../events/entities/event.entity';
import { EventsService } from '../events/events.service';
import { SourcesService } from '../sources/sources.service';

const HEADER_WHITELIST = ['content-type', 'user-agent', 'x-webhook-secret'];

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  /** Ключ состоит из sourceId и Idempotency-Key. */
  private readonly idempotency = new Map<string, string>();

  constructor(
    private readonly sourcesService: SourcesService,
    private readonly eventsService: EventsService,
    private readonly deliveryService: DeliveryService,
  ) {}

  /**
   * Проверяет источник и secret, сохраняет событие и запускает
   * асинхронную доставку.
   *
   * Сохранение в Map выполняется синхронно. JSON-snapshot ставится
   * StorageService в последовательную очередь записи.
   */
  ingest(
    sourceId: string,
    body: unknown,
    headers: Record<string, string | string[] | undefined>,
  ): { eventId: string; status: 'received' } {
    // 404 до проверки секрета: у несуществующего источника нечего сверять.
    const source = this.sourcesService.getEntityOrThrow(sourceId);

    if (source.secret) {
      const provided = this.headerValue(headers['x-webhook-secret']);

      if (!provided || !this.secretsMatch(source.secret, provided)) {
        throw new UnauthorizedException('Invalid webhook secret');
      }
    }

    const idempotencyKey = this.headerValue(headers['idempotency-key']);
    const scopedIdempotencyKey = idempotencyKey
      ? `${sourceId}:${idempotencyKey}`
      : undefined;

    if (scopedIdempotencyKey) {
      const existingEventId = this.idempotency.get(scopedIdempotencyKey);

      if (existingEventId) {
        return {
          eventId: existingEventId,
          status: 'received',
        };
      }
    }

    const event: StoredEvent = {
      id: randomUUID(),
      sourceId,
      headers: this.pickHeaders(headers),
      body,
      receivedAt: new Date().toISOString(),
      delivery: {
        status: 'pending',
        attempts: [],
        lastError: null,
      },
    };

    this.eventsService.add(event);

    if (scopedIdempotencyKey) {
      this.idempotency.set(scopedIdempotencyKey, event.id);
    }

    // Клиент получает 202 после синхронного обновления Map и постановки
    // snapshot в очередь записи.
    void this.deliveryService
      .deliverWithRetries(event.id)
      .catch((error: unknown) => {
        this.logger.error({
          message: 'Unexpected delivery orchestration error',
          eventId: event.id,
          sourceId: event.sourceId,
          error: this.errorMessage(error),
        });
      });

    return {
      eventId: event.id,
      status: 'received',
    };
  }

  /**
   * Timing-safe сравнение: обычное `===` может завершаться тем быстрее,
   * чем раньше расходятся строки. Перед timingSafeEqual обе стороны
   * хэшируются, чтобы буферы всегда имели одинаковую длину.
   */
  private secretsMatch(expected: string, provided: string): boolean {
    const expectedHash = createHash('sha256').update(expected).digest();
    const providedHash = createHash('sha256').update(provided).digest();

    return timingSafeEqual(expectedHash, providedHash);
  }

  /**
   * Сохраняет только разрешённые заголовки и маскирует secret.
   */
  private pickHeaders(
    headers: Record<string, string | string[] | undefined>,
  ): Record<string, string> {
    const picked: Record<string, string> = {};

    for (const name of HEADER_WHITELIST) {
      const value = this.headerValue(headers[name]);

      if (value !== undefined) {
        picked[name] = name === 'x-webhook-secret' ? '***' : value;
      }
    }

    return picked;
  }

  private headerValue(
    value: string | string[] | undefined,
  ): string | undefined {
    return Array.isArray(value) ? value[0] : value;
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message || error.name;
    }

    return String(error);
  }
}
