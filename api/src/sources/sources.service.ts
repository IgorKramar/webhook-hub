import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CreateSourceDto } from './dto/create-source.dto';
import { UpdateSourceDto } from './dto/update-source.dto';
import { Source } from './entities/source.entity';

@Injectable()
export class SourcesService {
  private readonly sources = new Map<string, Source>();

  create(dto: CreateSourceDto): Source {
    this.assertSlugFree(dto.slug);

    const source: Source = {
      id: randomUUID(),
      name: dto.name,
      slug: dto.slug,
      ...(dto.subscriberUrl ? { subscriberUrl: dto.subscriberUrl } : {}),
      createdAt: new Date().toISOString(),
    };
    this.sources.set(source.id, source);
    return source;
  }

  findAll(): Source[] {
    return [...this.sources.values()];
  }

  findOne(id: string): Source {
    const source = this.sources.get(id);
    if (!source) {
      throw new NotFoundException(`Source "${id}" not found`);
    }
    return source;
  }

  findBySlug(slug: string): Source | undefined {
    return [...this.sources.values()].find((s) => s.slug === slug);
  }

  update(id: string, dto: UpdateSourceDto): Source {
    const source = this.findOne(id);
    if (dto.slug && dto.slug !== source.slug) {
      this.assertSlugFree(dto.slug);
    }
    const updated: Source = { ...source, ...dto };
    this.sources.set(id, updated);
    return updated;
  }

  remove(id: string): void {
    if (!this.sources.delete(id)) {
      throw new NotFoundException(`Source "${id}" not found`);
    }
  }

  private assertSlugFree(slug: string): void {
    if (this.findBySlug(slug)) {
      throw new ConflictException(`Slug "${slug}" is already taken`);
    }
  }
}
