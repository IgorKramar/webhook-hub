import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { EventsService } from '../events/events.service';
import { StoredEvent } from '../events/entities/event.entity';
import { SourcesService } from '../sources/sources.service';

const HEADER_WHITELIST = ['content-type', 'user-agent', 'x-webhook-secret'];

@Injectable()
export class WebhooksService {
  /** Idempotency-Key -> eventId. */
  private readonly idempotency = new Map<string, string>();

  constructor(
    private readonly sourcesService: SourcesService,
    private readonly eventsService: EventsService,
  ) {}

  ingest(
    sourceId: string,
    body: unknown,
    headers: Record<string, string | string[] | undefined>,
  ): { eventId: string; status: 'received' } {
    // 404 до проверки секрета: у несуществующего источника нечего сверять
    const source = this.sourcesService.getEntityOrThrow(sourceId);

    if (source.secret) {
      const provided = this.headerValue(headers['x-webhook-secret']);
      if (!provided || !this.secretsMatch(source.secret, provided)) {
        throw new UnauthorizedException('Invalid webhook secret');
      }
    }

    const idempotencyKey = this.headerValue(headers['idempotency-key']);
    if (idempotencyKey) {
      const existing = this.idempotency.get(`${sourceId}:${idempotencyKey}`);
      if (existing) {
        return { eventId: existing, status: 'received' };
      }
    }

    const event: StoredEvent = {
      id: randomUUID(),
      sourceId,
      headers: this.pickHeaders(headers),
      body,
      receivedAt: new Date().toISOString(),
      delivery: { status: 'pending', attempts: [], lastError: null },
    };
    this.eventsService.add(event);

    if (idempotencyKey) {
      this.idempotency.set(`${sourceId}:${idempotencyKey}`, event.id);
    }

    // TODO: fire-and-forget запуск доставки с .catch()

    return { eventId: event.id, status: 'received' };
  }

  /**
   * Timing-safe сравнение: обычное `===` возвращает результат тем быстрее,
   * чем раньше расходятся строки, что позволяет подбирать секрет посимвольно
   * по времени ответа. timingSafeEqual сравнивает за константное время;
   * хэшируем обе стороны, чтобы выровнять длину буферов (иначе она утекает).
   */
  private secretsMatch(expected: string, provided: string): boolean {
    const a = createHash('sha256').update(expected).digest();
    const b = createHash('sha256').update(provided).digest();
    return timingSafeEqual(a, b);
  }

  /** Whitelist; значение секрета маскируется. */
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

  private headerValue(v: string | string[] | undefined): string | undefined {
    return Array.isArray(v) ? v[0] : v;
  }
}
