import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DeliveryAttempt,
  DeliveryStatus,
  StoredEvent,
} from './entities/event.entity';

/**
 * In-memory хранилище событий. Map сохраняет порядок вставки.
 *
 * Все изменения delivery проходят через этот сервис, чтобы позднее
 * можно было добавить персистентность без изменения DeliveryService.
 */
@Injectable()
export class EventsService {
  private readonly events = new Map<string, StoredEvent>();

  /**
   * Сохраняет новое событие.
   */
  add(event: StoredEvent): void {
    this.events.set(event.id, event);
  }

  /**
   * Возвращает событие по идентификатору или undefined.
   */
  findById(id: string): StoredEvent | undefined {
    return this.events.get(id);
  }

  /**
   * Возвращает событие или выбрасывает 404.
   */
  getByIdOrThrow(id: string): StoredEvent {
    const event = this.events.get(id);

    if (!event) {
      throw new NotFoundException(`Event "${id}" not found`);
    }

    return event;
  }

  /**
   * Возвращает все события в порядке вставки.
   */
  findAll(): StoredEvent[] {
    return [...this.events.values()];
  }

  /**
   * Атомарно добавляет попытку доставки и обновляет связанное с ней
   * состояние delivery.
   *
   * История предыдущих попыток сохраняется.
   */
  recordDeliveryAttempt(
    eventId: string,
    attempt: DeliveryAttempt,
    status: DeliveryStatus,
    lastError: string | null,
  ): void {
    const event = this.getByIdOrThrow(eventId);

    event.delivery.attempts.push(attempt);
    event.delivery.status = status;
    event.delivery.lastError = lastError;
  }
}
