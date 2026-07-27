import {
  Injectable,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import type { EventStatusFilter } from './dto/list-events-query.dto';
import {
  DeliveryAttempt,
  DeliveryStatus,
  StoredEvent,
} from './entities/event.entity';
import { StorageService } from '../storage/storage.service';

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
 * In-memory представление событий с персистентностью в JSON-файле.
 *
 * Map является актуальным состоянием работающего процесса. После каждой
 * мутации полный snapshot событий ставится в последовательную очередь
 * записи StorageService.
 *
 * Все изменения delivery проходят через этот сервис, чтобы не допустить
 * обхода персистентности со стороны DeliveryService.
 */
@Injectable()
export class EventsService implements OnModuleInit {
  private readonly events = new Map<string, StoredEvent>();

  constructor(
    @Optional()
    private readonly storage?: StorageService,
  ) {}

  /**
   * Загружает сохранённые события после инициализации модуля.
   *
   * При отсутствии StorageService, например в изолированном unit-тесте,
   * сервис работает только в памяти.
   */
  onModuleInit(): void {
    for (const event of this.storage?.getEvents() ?? []) {
      this.events.set(event.id, event);
    }
  }

  /**
   * Сохраняет новое событие в памяти и ставит актуальный snapshot
   * событий в очередь записи.
   */
  add(event: StoredEvent): void {
    this.events.set(event.id, event);
    this.persist();
  }

  /**
   * Возвращает событие по идентификатору или undefined.
   *
   * Возвращаемый объект является внутренней mutable-моделью. Изменять
   * delivery напрямую нельзя: для этого предназначены методы сервиса.
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
   * received означает pending-событие, у которого ещё нет попыток
   * доставки.
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
   * История предыдущих попыток сохраняется. Изменённое состояние
   * ставится в очередь записи после выполнения мутации.
   */
  markDeliveryPending(eventId: string): void {
    const event = this.getByIdOrThrow(eventId);

    event.delivery.status = 'pending';
    event.delivery.lastError = null;

    this.persist();
  }

  /**
   * Добавляет попытку доставки и обновляет связанное состояние delivery.
   *
   * После синхронной мутации Map создаётся snapshot актуального состояния
   * и ставится в последовательную очередь записи. История предыдущих
   * попыток не удаляется.
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

    this.persist();
  }

  /**
   * Ставит в очередь запись полного snapshot событий.
   */
  private persist(): void {
    this.storage?.saveEvents([...this.events.values()]);
  }
}
