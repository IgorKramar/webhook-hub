import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { CreateSourceDto } from './dto/create-source.dto';
import { SourceResponseDto } from './dto/source-response.dto';
import { Source } from './entities/source.entity';

@Injectable()
export class SourcesService {
  private readonly sources = new Map<string, Source>();

  constructor(private readonly config: ConfigService) {}

  create(dto: CreateSourceDto): SourceResponseDto {
    const source: Source = {
      id: randomUUID(),
      name: dto.name,
      ...(dto.secret ? { secret: dto.secret } : {}),
      ...(dto.subscriberUrl ? { subscriberUrl: dto.subscriberUrl } : {}),
      createdAt: new Date().toISOString(),
    };
    this.sources.set(source.id, source);
    return this.toResponse(source);
  }

  findAll(): SourceResponseDto[] {
    return [...this.sources.values()].map((s) => this.toResponse(s));
  }

  findOne(id: string): SourceResponseDto {
    return this.toResponse(this.getEntityOrThrow(id));
  }

  /**
   * Внутренняя модель с secret — только для ingest-модуля
   * (проверка X-Webhook-Secret). Через контроллеры наружу не отдавать.
   */
  getEntityOrThrow(id: string): Source {
    const source = this.sources.get(id);
    if (!source) {
      throw new NotFoundException(`Source "${id}" not found`);
    }
    return source;
  }

  /** secret намеренно не попадает в ответ — наружу только hasSecret. */
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
