import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DeliveryAttempt,
  DeliveryStatus,
  StoredEvent,
} from './entities/event.entity';
import type { EventStatusFilter } from './dto/list-events-query.dto';

export interface FindEventsOptions {
  sourceId?: string;
  status?: EventStatusFilter;
  page: number;
  limit: number;
}

export interface EventsPage {
  items: StoredEvent[];
  page: number;
  limit: number;
  total: number;
}

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
   * Возвращает отфильтрованную страницу событий.
   *
   * События сортируются по receivedAt от новых к старым.
   * received означает pending-событие, у которого ещё нет попыток доставки.
   */
  findPage(options: FindEventsOptions): EventsPage {
    const filtered = [...this.events.values()]
      .filter(
        (event) => !options.sourceId || event.sourceId === options.sourceId,
      )
      .filter((event) => {
        if (!options.status) {
          return true;
        }

        if (options.status === 'received') {
          return (
            event.delivery.status === 'pending' &&
            event.delivery.attempts.length === 0
          );
        }

        return event.delivery.status === options.status;
      })
      .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt));

    const total = filtered.length;
    const offset = (options.page - 1) * options.limit;

    return {
      items: filtered.slice(offset, offset + options.limit),
      page: options.page,
      limit: options.limit,
      total,
    };
  }

  /**
   * Переводит событие в pending перед новой ручной серией доставки.
   *
   * История предыдущих попыток сохраняется.
   */
  markDeliveryPending(eventId: string): void {
    const event = this.getByIdOrThrow(eventId);

    event.delivery.status = 'pending';
    event.delivery.lastError = null;
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
