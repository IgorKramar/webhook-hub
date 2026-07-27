import {
  BeforeApplicationShutdown,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { StoredEvent } from '../events/entities/event.entity';
import type { Source } from '../sources/entities/source.entity';

const DEFAULT_DATA_DIRECTORY = resolve(__dirname, '../../../data');

@Injectable()
export class StorageService implements OnModuleInit, BeforeApplicationShutdown {
  private readonly logger = new Logger(StorageService.name);

  private readonly dataDirectory =
    process.env.DATA_DIR ?? DEFAULT_DATA_DIRECTORY;

  private readonly sourcesFile = resolve(this.dataDirectory, 'sources.json');

  private readonly eventsFile = resolve(this.dataDirectory, 'events.json');

  private sources: Source[] = [];
  private events: StoredEvent[] = [];

  /**
   * Единая очередь операций записи.
   *
   * Все snapshot источников и событий записываются последовательно.
   * Это предотвращает ситуацию, когда более старая медленная запись
   * завершится после новой и перезапишет актуальное состояние.
   */
  private writeQueue: Promise<void> = Promise.resolve();

  /**
   * Создаёт каталог данных и загружает JSON-файлы в память.
   *
   * Отсутствующий файл трактуется как пустая коллекция. Ошибка чтения
   * или повреждённый JSON логируются, после чего соответствующая
   * коллекция остаётся пустой.
   */
  async onModuleInit(): Promise<void> {
    await mkdir(this.dataDirectory, {
      recursive: true,
    });

    const [sources, events] = await Promise.all([
      this.readCollection<Source>(this.sourcesFile),
      this.readCollection<StoredEvent>(this.eventsFile),
    ]);

    this.sources = sources;
    this.events = events;

    this.logger.log({
      message: 'Persistent storage loaded',
      dataDirectory: this.dataDirectory,
      sources: this.sources.length,
      events: this.events.length,
    });
  }

  /**
   * Дожидается завершения поставленных в очередь операций записи
   * перед остановкой приложения.
   */
  async beforeApplicationShutdown(): Promise<void> {
    await this.flush();
  }

  /**
   * Возвращает независимый snapshot загруженных источников.
   *
   * Изменение результата не влияет на внутреннее состояние
   * StorageService.
   */
  getSources(): Source[] {
    return structuredClone(this.sources);
  }

  /**
   * Возвращает независимый snapshot загруженных событий.
   *
   * Изменение результата не влияет на внутреннее состояние
   * StorageService.
   */
  getEvents(): StoredEvent[] {
    return structuredClone(this.events);
  }

  /**
   * Обновляет in-memory snapshot источников и ставит его в очередь
   * атомарной записи.
   *
   * Метод не блокирует вызывающий HTTP-запрос ожиданием файловой системы.
   */
  saveSources(sources: Source[]): void {
    const snapshot = structuredClone(sources);

    this.sources = snapshot;
    this.enqueueWrite(this.sourcesFile, snapshot);
  }

  /**
   * Обновляет in-memory snapshot событий и ставит его в очередь
   * атомарной записи.
   *
   * Метод не блокирует вызывающий HTTP-запрос ожиданием файловой системы.
   */
  saveEvents(events: StoredEvent[]): void {
    const snapshot = structuredClone(events);

    this.events = snapshot;
    this.enqueueWrite(this.eventsFile, snapshot);
  }

  /**
   * Дожидается завершения всех операций, уже поставленных в очередь.
   *
   * Используется при graceful shutdown и в тестах персистентности.
   */
  async flush(): Promise<void> {
    await this.writeQueue;
  }

  /**
   * Читает JSON-массив из файла.
   *
   * ENOENT означает, что приложение запускается впервые, поэтому
   * возвращается пустая коллекция.
   */
  private async readCollection<T>(filePath: string): Promise<T[]> {
    try {
      const content = await readFile(filePath, 'utf8');
      const parsed: unknown = JSON.parse(content) as unknown;

      if (!Array.isArray(parsed)) {
        this.logger.warn({
          message: 'Storage file does not contain an array',
          filePath,
        });

        return [];
      }

      return structuredClone(parsed as T[]);
    } catch (error: unknown) {
      if (this.isFileNotFoundError(error)) {
        return [];
      }

      this.logger.error({
        message: 'Failed to read persistent storage file',
        filePath,
        error: this.errorMessage(error),
      });

      return [];
    }
  }

  /**
   * Добавляет атомарную запись snapshot в общую последовательную
   * promise-chain.
   *
   * Ошибка одной записи перехватывается, чтобы очередь не оставалась
   * навсегда в rejected-состоянии и последующие записи могли выполниться.
   */
  private enqueueWrite(filePath: string, value: unknown): void {
    const snapshot = structuredClone(value);

    this.writeQueue = this.writeQueue
      .then(() => this.writeAtomically(filePath, snapshot))
      .catch((error: unknown) => {
        this.logger.error({
          message: 'Failed to persist storage snapshot',
          filePath,
          error: this.errorMessage(error),
        });
      });
  }

  /**
   * Записывает JSON во временный файл, затем атомарно заменяет целевой.
   *
   * Благодаря последовательной очереди два вызова для одного файла
   * не используют временный путь одновременно.
   */
  private async writeAtomically(
    filePath: string,
    value: unknown,
  ): Promise<void> {
    const temporaryPath = `${filePath}.tmp`;
    const content = `${JSON.stringify(value, null, 2)}\n`;

    await writeFile(temporaryPath, content, 'utf8');
    await rename(temporaryPath, filePath);
  }

  private isFileNotFoundError(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT';
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message || error.name;
    }

    return String(error);
  }
}
