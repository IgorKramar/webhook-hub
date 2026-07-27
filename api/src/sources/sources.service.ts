import {
  Injectable,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { StorageService } from '../storage/storage.service';
import { CreateSourceDto } from './dto/create-source.dto';
import { SourceResponseDto } from './dto/source-response.dto';
import { Source } from './entities/source.entity';

@Injectable()
export class SourcesService implements OnModuleInit {
  private readonly sources = new Map<string, Source>();

  constructor(
    private readonly config: ConfigService,
    @Optional()
    private readonly storage?: StorageService,
  ) {}

  /**
   * Загружает сохранённые источники после инициализации модуля.
   *
   * При отсутствии StorageService, например в изолированном unit-тесте,
   * сервис продолжает работать только в памяти.
   */
  onModuleInit(): void {
    for (const source of this.storage?.getSources() ?? []) {
      this.sources.set(source.id, source);
    }
  }

  /**
   * Создаёт источник, сохраняет его в памяти и ставит на запись
   * актуальный snapshot всех источников.
   */
  create(dto: CreateSourceDto): SourceResponseDto {
    const source: Source = {
      id: randomUUID(),
      name: dto.name,
      ...(dto.secret ? { secret: dto.secret } : {}),
      ...(dto.subscriberUrl ? { subscriberUrl: dto.subscriberUrl } : {}),
      createdAt: new Date().toISOString(),
    };

    this.sources.set(source.id, source);
    this.persist();

    return this.toResponse(source);
  }

  /**
   * Возвращает публичные представления всех источников.
   *
   * Secret никогда не включается в результат.
   */
  findAll(): SourceResponseDto[] {
    return [...this.sources.values()].map((source) => this.toResponse(source));
  }

  /**
   * Возвращает публичное представление источника или выбрасывает 404.
   */
  findOne(id: string): SourceResponseDto {
    return this.toResponse(this.getEntityOrThrow(id));
  }

  /**
   * Возвращает внутреннюю модель источника, содержащую secret.
   *
   * Метод предназначен только для внутренних сервисов ingest и delivery.
   * Результат нельзя напрямую возвращать из контроллера.
   */
  getEntityOrThrow(id: string): Source {
    const source = this.sources.get(id);

    if (!source) {
      throw new NotFoundException(`Source "${id}" not found`);
    }

    return source;
  }

  /**
   * Ставит в очередь запись полного snapshot источников.
   */
  private persist(): void {
    this.storage?.saveSources([...this.sources.values()]);
  }

  /**
   * Преобразует внутреннюю модель в безопасный публичный ответ.
   *
   * Secret намеренно заменяется признаком hasSecret.
   */
  private toResponse(source: Source): SourceResponseDto {
    const port = this.config.get<string>('API_PORT') ?? '4002';

    return {
      id: source.id,
      name: source.name,
      ingestUrl: `http://localhost:${port}/webhooks/${source.id}`,
      hasSecret: Boolean(source.secret),
      ...(source.subscriberUrl ? { subscriberUrl: source.subscriberUrl } : {}),
      createdAt: source.createdAt,
    };
  }
}
