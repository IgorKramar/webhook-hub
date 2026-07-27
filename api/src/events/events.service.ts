import { Injectable } from '@nestjs/common';
import { StoredEvent } from './entities/event.entity';

/**
 * In-memory хранилище событий. Map сохраняет порядок вставки,
 * что даёт бесплатную сортировку по receivedAt для списка.
 */
@Injectable()
export class EventsService {
  private readonly events = new Map<string, StoredEvent>();

  add(event: StoredEvent): void {
    this.events.set(event.id, event);
  }

  findById(id: string): StoredEvent | undefined {
    return this.events.get(id);
  }

  findAll(): StoredEvent[] {
    return [...this.events.values()];
  }
}
