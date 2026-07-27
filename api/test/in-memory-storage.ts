import { Injectable } from '@nestjs/common';
import type { StoredEvent } from '../src/events/entities/event.entity';
import type { Source } from '../src/sources/entities/source.entity';

@Injectable()
export class InMemoryStorageService {
  private sources: Source[] = [];
  private events: StoredEvent[] = [];

  getSources(): Source[] {
    return structuredClone(this.sources);
  }

  getEvents(): StoredEvent[] {
    return structuredClone(this.events);
  }

  saveSources(sources: Source[]): void {
    this.sources = structuredClone(sources);
  }

  saveEvents(events: StoredEvent[]): void {
    this.events = structuredClone(events);
  }

  async flush(): Promise<void> {
    // Записи в тестовом double выполняются синхронно в памяти.
  }
}
