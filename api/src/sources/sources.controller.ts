import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CreateSourceDto } from './dto/create-source.dto';
import { SourceResponseDto } from './dto/source-response.dto';
import { SourcesService } from './sources.service';

@ApiTags('sources')
@Controller('api/sources')
export class SourcesController {
  constructor(private readonly sourcesService: SourcesService) {}

  @Post()
  @ApiOperation({ summary: 'Создать источник' })
  @ApiCreatedResponse({ type: SourceResponseDto })
  create(@Body() dto: CreateSourceDto): SourceResponseDto {
    return this.sourcesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Список источников' })
  @ApiOkResponse({ type: SourceResponseDto, isArray: true })
  findAll(): SourceResponseDto[] {
    return this.sourcesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить источник по id' })
  @ApiOkResponse({ type: SourceResponseDto })
  @ApiNotFoundResponse({ description: 'Источник не найден' })
  findOne(@Param('id', ParseUUIDPipe) id: string): SourceResponseDto {
    return this.sourcesService.findOne(id);
  }
}
