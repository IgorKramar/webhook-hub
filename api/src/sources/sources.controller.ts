import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CreateSourceDto } from './dto/create-source.dto';
import { UpdateSourceDto } from './dto/update-source.dto';
import { Source } from './entities/source.entity';
import { SourcesService } from './sources.service';

@ApiTags('sources')
@Controller('sources')
export class SourcesController {
  constructor(private readonly sourcesService: SourcesService) {}

  @Post()
  @ApiOperation({ summary: 'Создать источник' })
  @ApiCreatedResponse({ type: Source })
  @ApiConflictResponse({ description: 'Slug уже занят' })
  create(@Body() dto: CreateSourceDto): Source {
    return this.sourcesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Список источников' })
  @ApiOkResponse({ type: Source, isArray: true })
  findAll(): Source[] {
    return this.sourcesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить источник по id' })
  @ApiOkResponse({ type: Source })
  @ApiNotFoundResponse({ description: 'Источник не найден' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Source {
    return this.sourcesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Частично обновить источник' })
  @ApiOkResponse({ type: Source })
  @ApiNotFoundResponse({ description: 'Источник не найден' })
  @ApiConflictResponse({ description: 'Slug уже занят' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSourceDto,
  ): Source {
    return this.sourcesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Удалить источник' })
  @ApiNoContentResponse({ description: 'Удалён' })
  @ApiNotFoundResponse({ description: 'Источник не найден' })
  remove(@Param('id', ParseUUIDPipe) id: string): void {
    this.sourcesService.remove(id);
  }
}
