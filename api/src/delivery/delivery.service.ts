import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import {
  DeliveryAttempt,
  DeliveryStatus,
  StoredEvent,
} from '../events/entities/event.entity';
import { EventsService } from '../events/events.service';
import { Source } from '../sources/entities/source.entity';
import { SourcesService } from '../sources/sources.service';

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1_000, 3_000];
const REQUEST_TIMEOUT_MS = 5_000;

interface DeliveryBody {
  eventId: string;
  sourceId: string;
  payload: unknown;
  receivedAt: string;
}

interface AttemptResult {
  statusCode: number | null;
  error: string | null;
  delivered: boolean;
}

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(
    private readonly eventsService: EventsService,
    private readonly sourcesService: SourcesService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Выполняет серию максимум из трёх попыток доставки.
   *
   * Первая попытка выполняется немедленно. При ошибках вторая выполняется
   * через 1 секунду, третья — ещё через 3 секунды.
   *
   * Ожидаемые ошибки подписчика не приводят к rejected promise:
   * результат сохраняется в event.delivery.
   */
  async deliverWithRetries(eventId: string): Promise<void> {
    const event = this.eventsService.getByIdOrThrow(eventId);
    const source = this.sourcesService.getEntityOrThrow(event.sourceId);
    const subscriberUrl = this.resolveSubscriberUrl(source);

    const deliveryBody = this.createDeliveryBody(event);
    const serializedBody = JSON.stringify(deliveryBody);
    const headers = this.createHeaders(source, serializedBody);

    for (
      let attemptNumber = 1;
      attemptNumber <= MAX_ATTEMPTS;
      attemptNumber++
    ) {
      if (attemptNumber > 1) {
        await this.sleep(RETRY_DELAYS_MS[attemptNumber - 2]);
      }

      const result = await this.deliverOnce(
        subscriberUrl,
        serializedBody,
        headers,
      );

      const isFinalAttempt = attemptNumber === MAX_ATTEMPTS;
      const status = this.resolveStatus(result.delivered, isFinalAttempt);
      const lastError = result.delivered ? null : result.error;

      const attempt: DeliveryAttempt = {
        at: new Date().toISOString(),
        statusCode: result.statusCode,
        error: result.error,
      };

      this.eventsService.recordDeliveryAttempt(
        event.id,
        attempt,
        status,
        lastError,
      );

      this.logAttempt({
        event,
        subscriberUrl,
        attemptNumber,
        result,
      });

      if (result.delivered) {
        return;
      }
    }
  }

  private async deliverOnce(
    subscriberUrl: string,
    serializedBody: string,
    headers: Record<string, string>,
  ): Promise<AttemptResult> {
    try {
      const response = await fetch(subscriberUrl, {
        method: 'POST',
        headers,
        body: serializedBody,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (response.ok) {
        return {
          statusCode: response.status,
          error: null,
          delivered: true,
        };
      }

      return {
        statusCode: response.status,
        error: `HTTP ${response.status}`,
        delivered: false,
      };
    } catch (error: unknown) {
      return {
        statusCode: null,
        error: this.errorMessage(error),
        delivered: false,
      };
    }
  }

  private createDeliveryBody(event: StoredEvent): DeliveryBody {
    return {
      eventId: event.id,
      sourceId: event.sourceId,
      payload: event.body,
      receivedAt: event.receivedAt,
    };
  }

  private createHeaders(
    source: Source,
    serializedBody: string,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };

    if (source.secret) {
      const digest = createHmac('sha256', source.secret)
        .update(serializedBody)
        .digest('hex');

      headers['x-signature'] = `sha256=${digest}`;
    }

    return headers;
  }

  private resolveSubscriberUrl(source: Source): string {
    const subscriberUrl =
      source.subscriberUrl ?? this.config.get<string>('SUBSCRIBER_URL');

    if (!subscriberUrl) {
      throw new Error(
        `Subscriber URL is not configured for source "${source.id}"`,
      );
    }

    return subscriberUrl;
  }

  private resolveStatus(
    delivered: boolean,
    isFinalAttempt: boolean,
  ): DeliveryStatus {
    if (delivered) {
      return 'delivered';
    }

    return isFinalAttempt ? 'failed' : 'pending';
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message || error.name;
    }

    return String(error);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private logAttempt(params: {
    event: StoredEvent;
    subscriberUrl: string;
    attemptNumber: number;
    result: AttemptResult;
  }): void {
    const { event, subscriberUrl, attemptNumber, result } = params;

    this.logger.log({
      message: 'Webhook delivery attempt completed',
      eventId: event.id,
      sourceId: event.sourceId,
      attempt: attemptNumber,
      statusCode: result.statusCode,
      error: result.error,
      subscriberUrl,
    });
  }
}
